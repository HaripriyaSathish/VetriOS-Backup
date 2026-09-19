"""TCP-to-SOCKS5 relay so Django (via psycopg) can reach the tailnet-only
Postgres host from inside this container.

Why this exists: Render's containers don't grant access to /dev/net/tun,
so tailscaled here runs in --tun=userspace-networking mode instead of the
usual mode that transparently routes OS traffic through a virtual network
interface. In userspace mode, only traffic explicitly sent through
tailscaled's local SOCKS5 proxy actually reaches the tailnet — a plain
psycopg TCP connect to the Tailscale IP would NOT go anywhere.

This script listens on a plain local TCP port (what Django's DB_HOST/
DB_PORT actually point at) and, for each connection, opens a matching
SOCKS5-proxied connection to the real Postgres host on the tailnet,
then pipes bytes between the two sockets until either side closes.

Run this only after `tailscale up` has completed — see entrypoint.sh.
"""

import os
import socket
import socketserver
import sys
import threading

import socks  # PySocks

LISTEN_HOST = "127.0.0.1"
LISTEN_PORT = int(os.environ.get("PG_PROXY_LISTEN_PORT", "5433"))

SOCKS_HOST = "127.0.0.1"
SOCKS_PORT = int(os.environ.get("TAILSCALE_SOCKS_PORT", "1055"))

TARGET_HOST = os.environ["TAILSCALE_DB_HOST"]
TARGET_PORT = int(os.environ.get("TAILSCALE_DB_PORT", "5432"))

BUFFER_SIZE = 65536


def pipe(src, dst):
    try:
        while True:
            data = src.recv(BUFFER_SIZE)
            if not data:
                break
            dst.sendall(data)
    except OSError:
        pass
    finally:
        for sock in (src, dst):
            try:
                sock.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            sock.close()


class RelayHandler(socketserver.BaseRequestHandler):
    def handle(self):
        client = self.request
        upstream = socks.socksocket()
        upstream.set_proxy(socks.SOCKS5, SOCKS_HOST, SOCKS_PORT)
        try:
            upstream.connect((TARGET_HOST, TARGET_PORT))
        except Exception as exc:
            print(f"[pg-proxy] could not reach {TARGET_HOST}:{TARGET_PORT} "
                  f"via tailscale SOCKS5 proxy: {exc}", file=sys.stderr, flush=True)
            client.close()
            return

        t1 = threading.Thread(target=pipe, args=(client, upstream), daemon=True)
        t2 = threading.Thread(target=pipe, args=(upstream, client), daemon=True)
        t1.start()
        t2.start()
        t1.join()
        t2.join()


class ThreadingTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    server = ThreadingTCPServer((LISTEN_HOST, LISTEN_PORT), RelayHandler)
    print(f"[pg-proxy] listening on {LISTEN_HOST}:{LISTEN_PORT}, "
          f"relaying to {TARGET_HOST}:{TARGET_PORT} via SOCKS5 "
          f"{SOCKS_HOST}:{SOCKS_PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()

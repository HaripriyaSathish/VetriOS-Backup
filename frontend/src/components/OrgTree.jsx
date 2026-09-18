import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

const BRAND_BLUE = '#0051D5';

const BRANCH_COLORS = [
  { bg: '#EFF6FF', border: '#3B82F6', avatar: '#3B82F6' }, // blue
  { bg: '#F0FDF4', border: '#22C55E', avatar: '#22C55E' }, // green
  { bg: '#FEF3C7', border: '#F59E0B', avatar: '#F59E0B' }, // amber
  { bg: '#FCE7F3', border: '#EC4899', avatar: '#EC4899' }, // pink
  { bg: '#F3E8FF', border: '#A855F7', avatar: '#A855F7' }, // purple
  { bg: '#E0F2FE', border: '#0EA5E9', avatar: '#0EA5E9' }, // sky
];

function Avatar({ photo, name, size = 40, color }) {
  if (photo) {
    return <img src={photo} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: color || BRAND_BLUE,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      <span style={{ color: '#fff', fontWeight: 600, fontSize: size * 0.35 }}>
        {(name || '?')[0]?.toUpperCase()}
      </span>
    </div>
  );
}

function TreeNode({ node, depth, isRoot, onNodeClick, colors }) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;
  const c = isRoot ? { bg: '#EFF6FF', border: BRAND_BLUE, avatar: BRAND_BLUE } : colors;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div
        className="org-node-enter"
        onClick={() => !isRoot && onNodeClick && onNodeClick(node)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: c.bg,
          border: `1.5px solid ${c.border}`,
          borderRadius: 12, padding: '10px 16px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          animationDelay: `${depth * 0.08}s`,
          cursor: isRoot ? 'default' : 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        <Avatar photo={node.profile_photo} name={node.full_name || node.lead?.full_name} size={isRoot ? 44 : 38} color={c.avatar} />
        <div>
          <p style={{ fontSize: 15, fontWeight: 600, color: '#1E1B4B', margin: 0 }}>
            {node.full_name || node.lead?.full_name}
          </p>
          <p style={{ fontSize: 13, color: '#76777D', margin: 0 }}>
            {isRoot ? 'Project Lead' : node.designation}
          </p>
        </div>
        {hasChildren && (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', display: 'flex', marginLeft: 4 }}
          >
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        )}
      </div>

      {hasChildren && expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: 1, height: 20, background: c.border, opacity: 0.5 }} />
          <div style={{ display: 'flex', gap: 32, position: 'relative', paddingTop: 0 }}>
            {node.children.length > 1 && (
              <div
                style={{
                  position: 'absolute', top: 0, left: '50%', right: '50%',
                  height: 1, background: isRoot ? '#CBD5E1' : c.border,
                  opacity: isRoot ? 1 : 0.5,
                  width: `calc(100% - ${100 / node.children.length}%)`,
                  transform: 'translateX(-50%)',
                }}
              />
            )}
            {node.children.map((child, i) => (
              <div key={child.project_team_member_id || i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: node.children.length > 1 ? 20 : 0, position: 'relative' }}>
                {node.children.length > 1 && (
                  <div style={{ width: 1, height: 20, background: isRoot ? '#CBD5E1' : c.border, opacity: isRoot ? 1 : 0.5, position: 'absolute', top: 0 }} />
                )}
                <TreeNode
                  node={child}
                  depth={depth + 1}
                  isRoot={false}
                  onNodeClick={onNodeClick}
                  colors={isRoot ? BRANCH_COLORS[i % BRANCH_COLORS.length] : colors}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrgTree({ treeData, onNodeClick }) {
  if (!treeData) return null;

  return (
    <div style={{ overflowX: 'auto', padding: '20px 0' }}>
      <style>{`
        @keyframes orgNodeEnter {
          from { opacity: 0; transform: translateY(-8px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .org-node-enter { animation: orgNodeEnter 0.35s ease backwards; }
      `}</style>
      <div style={{ display: 'flex', justifyContent: 'center', minWidth: 'fit-content' }}>
        <TreeNode
          node={{ full_name: treeData.lead.full_name, profile_photo: treeData.lead.profile_photo, children: treeData.children }}
          depth={0}
          isRoot={true}
          onNodeClick={onNodeClick}
          colors={null}
        />
      </div>
    </div>
  );
}
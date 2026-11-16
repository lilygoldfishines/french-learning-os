import { NavLink, Link } from 'react-router-dom';
import { NAV } from '../App';
import { PageHeader, cx } from '../ui/kit';

/** Mobile-only sub-navigation between the knowledge-base pages. */
export function KnowledgeTabs() {
  const items = NAV.find((g) => g.group === '知识库')!.items;
  return (
    <nav className="-mx-4 mb-4 flex gap-1 overflow-x-auto px-4 text-sm md:hidden" aria-label="知识库">
      {items.map((i) => (
        <NavLink key={i.to} to={i.to} className={({ isActive }) => cx('rounded-full border px-3 py-1 whitespace-nowrap', isActive ? 'border-ink bg-ink text-paper' : 'border-line')}>{i.label}</NavLink>
      ))}
    </nav>
  );
}

export default function MorePage() {
  return (
    <div>
      <PageHeader title="更多" />
      <div className="space-y-5">
        {NAV.map((g) => (
          <div key={g.group}>
            <div className="mb-1 text-xs tracking-wider text-faint">{g.group}</div>
            <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
              {g.items.map((i) => (
                <li key={i.label}>
                  {i.soon ? (
                    <div className="flex justify-between px-4 py-3 text-faint"><span>{i.label}</span><span className="text-xs">第四阶段</span></div>
                  ) : (
                    <Link to={i.to} className="flex justify-between px-4 py-3"><span>{i.label}</span><span className="text-faint">›</span></Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

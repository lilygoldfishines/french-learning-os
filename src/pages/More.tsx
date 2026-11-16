import { NavLink, Link } from 'react-router-dom';
import { NAV } from '../App';
import { PageHeader, cx } from '../ui/kit';
import { tr } from '../i18n';

/** Mobile-only sub-navigation between the knowledge-base pages. */
export function KnowledgeTabs() {
  const items = NAV.find((g) => g.group === tr('知识库'))!.items;
  return (
    <nav className="-mx-4 mb-4 flex gap-5 overflow-x-auto border-b border-line px-4 text-[15px] md:hidden" aria-label={tr('知识库')}>
      {items.map((i) => (
        <NavLink key={i.to} to={i.to} className={({ isActive }) => cx('-mb-px border-b-2 py-2 whitespace-nowrap', isActive ? 'border-ink font-medium text-ink' : 'border-transparent text-muted')}>{i.label}</NavLink>
      ))}
    </nav>
  );
}

export default function MorePage() {
  return (
    <div>
      <PageHeader title={tr('更多')} />
      <div className="space-y-5">
        {NAV.map((g) => (
          <div key={g.group}>
            <div className="mb-1 text-xs tracking-wider text-faint">{g.group}</div>
            <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
              {g.items.map((i) => (
                <li key={i.label}>
                  {i.soon ? (
                    <div className="flex justify-between px-4 py-3 text-faint"><span>{i.label}</span><span className="text-xs">{tr('第四阶段')}</span></div>
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

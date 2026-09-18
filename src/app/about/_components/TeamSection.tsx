import { SectionTitle } from './SectionTitle';
import { TEAM } from './data';

// Matches .team-grid from the prototype.
export function TeamSection() {
  return (
    <div className="mb-8">
      <SectionTitle>Đội ngũ sáng lập</SectionTitle>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {TEAM.map((member) => (
          <div
            key={member.name}
            className="border-brand-border rounded-lg border bg-white p-4 text-center"
          >
            <div
              className={`mx-auto mb-2.5 flex h-[60px] w-[60px] items-center justify-center rounded-full text-[26px] font-bold text-white ${member.gradient}`}
            >
              {member.initial}
            </div>
            <div className="mb-0.5 text-[13px] font-semibold">{member.name}</div>
            <div className="text-brand-sub text-[11px]">
              {member.role}
              <br />
              <span className="text-brand-light">{member.detail}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

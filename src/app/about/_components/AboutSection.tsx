import { AboutHero } from './AboutHero';
import { WhySection } from './WhySection';
import { Timeline } from './Timeline';
import { TeamSection } from './TeamSection';
import { Partners } from './Partners';
import { AboutCta } from './AboutCta';

// Matches #about from the prototype.
export function AboutSection() {
  return (
    <div>
      <AboutHero />
      <div className="mx-auto max-w-[960px] px-4 py-8">
        <WhySection />
        <Timeline />
        <TeamSection />
        <Partners />
        <AboutCta />
      </div>
    </div>
  );
}

import { preload } from "react-dom";
import { Nav } from "@/components/marketing";
import { SetupNotice } from "@/components/setup-notice";
import { supabaseConfigured } from "@/lib/supabase/config";
import { LandingSurface } from "@/components/landing/motion-system";
import { HeroStage, TravelPreview } from "@/components/landing/travel-preview";
import { HeroInvitation } from "@/components/landing/hero-invitation";
import { LowerLanding, EditorialFooter } from "@/components/landing/lower-page";
import { DestinationProvider } from "@/components/landing/destination-context";
import { mcpResource, mcpOAuthEnabled, mcpApiKeyEnabled } from "@/lib/mcp-config";
import "./landing.css";
import "./landing-map.css";
import "./landing-dark.css";
import "./landing-globe.css";
import "./landing-mobile.css";
import "./landing-conversation.css";
import "./landing-scroll.css";
import "./landing-editorial.css";
import "./landing-choice.css";
import "./landing-lower.css";
import "./landing-conversation-details.css";
import "./landing-route-details.css";
import "./landing-route-motion.css";
import "./landing-integration-details.css";
import "./landing-logo-refinements.css";
import "./landing-footer.css";
import "./landing-mcp-guide.css";

export default function Home() {
  preload("/fonts/airo-editorial-italic.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  preload("/fonts/airo-korean-editorial-cities.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  return (
    <LandingSurface>
      <a className="skip-link" href="#main">본문으로 건너뛰기</a>
      <Nav premium />
      <div className="landing-notice"><SetupNotice configured={supabaseConfigured} /></div>
      <DestinationProvider><main id="main">
        <HeroStage>
          <div className="hero-grid landing-container">
            <div className="hero-copy">
              <HeroInvitation />
            </div>
            <TravelPreview />
          </div>
        </HeroStage>
        <LowerLanding mcp={{ endpoint: mcpResource, oauthEnabled: mcpOAuthEnabled, apiKeyEnabled: mcpApiKeyEnabled }} />
      </main></DestinationProvider>
      <EditorialFooter />
    </LandingSurface>
  );
}

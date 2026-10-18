import { Composition } from "remotion";
import { Oddshot, DURATION } from "./Oddshot";
import { OddshotDemo, DEMO_FRAMES, Thumb } from "./Demo";

export const Root: React.FC = () => (
  <>
    <Composition id="OddshotDemo" component={OddshotDemo} durationInFrames={DEMO_FRAMES} fps={30} width={1920} height={1080} />
    <Composition id="Thumb" component={Thumb} durationInFrames={1} fps={30} width={1920} height={1080} />
    <Composition id="Oddshot" component={Oddshot} durationInFrames={DURATION} fps={30} width={1920} height={1080} />
  </>
);

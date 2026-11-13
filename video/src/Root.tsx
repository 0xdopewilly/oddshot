import { Composition } from "remotion";
import { Oddshot, DURATION } from "./Oddshot";
import { OddshotDemo, DEMO_FRAMES, Thumb } from "./Demo";
import { StyleFrame, CastSheet } from "./Cast";
import { LateAgain, LateThumb, STORY_FRAMES } from "./Story";
import { ComicLook } from "./Comic";
import { Episode, EPISODE_FRAMES } from "./Episode";
import { UpdateCard, UpdateCardClean } from "./UpdateCard";
import { ArticleCover, ArticleLag, ArticleJobs, ArticleReceipts } from "./Article";
import { Update16 } from "./Update16";
import { Gta8x } from "./Gta8x";
import { Recap } from "./Recap";
import { Proof, PROOF_FRAMES } from "./Proof";
import { RATE } from "./ProofKit";

export const Root: React.FC = () => (
  <>
    <Composition id="Proof" component={Proof} durationInFrames={PROOF_FRAMES} fps={RATE} width={1920} height={1080} />
    <Composition id="Episode" component={Episode} durationInFrames={EPISODE_FRAMES} fps={30} width={1920} height={1080} />
    <Composition id="ArticleCover" component={ArticleCover} durationInFrames={1} fps={30} width={1500} height={600} />
    <Composition id="ArticleLag" component={ArticleLag} durationInFrames={1} fps={30} width={1600} height={1000} />
    <Composition id="ArticleJobs" component={ArticleJobs} durationInFrames={1} fps={30} width={1600} height={900} />
    <Composition id="ArticleReceipts" component={ArticleReceipts} durationInFrames={1} fps={30} width={1600} height={900} />
    <Composition id="Update16" component={Update16} durationInFrames={1} fps={30} width={1600} height={900} />
    <Composition id="Gta8x" component={Gta8x} durationInFrames={1} fps={30} width={1600} height={900} />
    <Composition id="Recap" component={Recap} durationInFrames={1} fps={30} width={1600} height={900} />
    <Composition id="UpdateCard" component={UpdateCard} durationInFrames={1} fps={30} width={1600} height={900} />
    <Composition id="UpdateCardClean" component={UpdateCardClean} durationInFrames={1} fps={30} width={1600} height={900} />
    <Composition id="LateAgain" component={LateAgain} durationInFrames={STORY_FRAMES} fps={30} width={1920} height={1080} />
    <Composition id="LateThumb" component={LateThumb} durationInFrames={1} fps={30} width={1920} height={1080} />
    <Composition id="OddshotDemo" component={OddshotDemo} durationInFrames={DEMO_FRAMES} fps={30} width={1920} height={1080} />
    <Composition id="Thumb" component={Thumb} durationInFrames={1} fps={30} width={1920} height={1080} />
    <Composition id="Oddshot" component={Oddshot} durationInFrames={DURATION} fps={30} width={1920} height={1080} />
    <Composition id="StyleFrame" component={StyleFrame} durationInFrames={1} fps={30} width={1920} height={1080} />
    <Composition id="ComicLook" component={ComicLook} durationInFrames={1} fps={30} width={1920} height={1080} />
    <Composition id="CastSheet" component={CastSheet} durationInFrames={1} fps={30} width={1920} height={1080} />
  </>
);

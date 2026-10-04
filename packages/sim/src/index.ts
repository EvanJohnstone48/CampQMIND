// @motherlode/sim: the world engine (Lane 1).

export { step, type StepOptions } from "./step";
export {
  createWorld,
  createContext,
  DEFAULT_SETUP,
  type WorldState,
  type WorldConfig,
  type WorldSetup,
  type SimContext,
  type MinerState,
} from "./world";
export { DIAL_DEFS, defaultDials, clampDial, type Dials } from "./dials";
export { loadMap, validateMap, travelMatrix, MapError } from "./map";
export { PLACEHOLDER_MAP } from "./placeholderMap";
export { defaultPopulation } from "./population";
export { wellbeing, needUtility, security, netWorth, costOfLivingPerDay, NEED_WEIGHTS, SHELTER, REST_QUALITY } from "./wellbeing";
export { workFactor, crowdFactor, digRate, caveInChance } from "./production";
export { exportPrice, importPrice } from "./tradingPost";
export { clearAuction, type AuctionOrder, type AuctionResult } from "./market";
export { checkInvariants } from "./books";
export { observeAll, snapshot, siteViews, jobViews, minerPublic, minerView, witnessedBy } from "./observe";
export { baselineBrain } from "./baselineBrain";
export { decideAll, runForward, forkCompare, hashState, recordRun, replayRun, type RunLog, type RunConfig, type RunOptions } from "./run";
export { balanceReport, type BalanceReport } from "./balance";

import { Dexterity } from "../core/sdk";

class DebugUtils {
  stats = {
    pathsExplored: 0,
    quotesRequested: 0,
    routesEvaluated: 0,
    startTime: 0,
  };

  resetStats() {
    this.stats = {
      pathsExplored: 0,
      quotesRequested: 0,
      routesEvaluated: 0,
      startTime: Date.now(),
    };
  }

  getStats() {
    return {
      ...this.stats,
      elapsedMs: Date.now() - this.stats.startTime,
    };
  }

  logPathfindingStart(tokenInId: string, tokenOutId: string, amount: number, maxHops: number) {
    if (!Dexterity.config.debug) return;
    this.resetStats();
    console.log(`\nPathfinding: ${tokenInId} -> ${tokenOutId} (${amount} units, max ${maxHops} hops)`);
  }

  logNoPathsFound() {
    if (!Dexterity.config.debug) return;
    console.log(`No paths found after exploring ${this.stats.pathsExplored} paths`);
  }

  logFoundPaths(pathsExplored: number, validRoutesCount: number, bestRouteAnalysis: any) {
    if (!Dexterity.config.debug) return;
    console.log(`Found ${validRoutesCount} valid routes from ${pathsExplored} paths`);
    if (bestRouteAnalysis) {
      console.log('Best route:', bestRouteAnalysis);
    }
  }

  logPathExploration(currentToken: string, visitedVaults: string[], currentPathLength: number, foundPaths: number) {
    if (!Dexterity.config.debug) return;
    console.log(`Exploring ${currentToken} (path length: ${currentPathLength}, found: ${foundPaths})`);
  }

  logRouteEvaluation(path: string[], inputAmount: number, outputAmount: number) {
    if (!Dexterity.config.debug) return;
    console.log(`Evaluating route: ${path.join(' -> ')}`);
    console.log(`In: ${inputAmount}, Out: ${outputAmount}`);
  }

  incrementPathsExplored() {
    this.stats.pathsExplored++;
  }

  incrementQuotesRequested() {
    this.stats.quotesRequested++;
  }
}

export const debugUtils = new DebugUtils();
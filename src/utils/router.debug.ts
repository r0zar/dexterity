// debug-utils.ts

export interface DebugConfig {
  enabled: boolean;
  logPathfinding?: boolean;
  logQuotes?: boolean;
  logEvaluation?: boolean;
  verbosity?: 1 | 2 | 3;
  callback?: (info: DebugInfo) => void;
}

export interface DebugInfo {
  phase: "pathfinding" | "evaluation" | "quote";
  details: any;
  timestamp: number;
}

class DebugUtils {
  config: DebugConfig = {
    enabled: false,
  };

  stats = {
    pathsExplored: 0,
    quotesRequested: 0,
    routesEvaluated: 0,
    startTime: 0,
  };

  setDebugMode(config: Partial<DebugConfig>) {
    this.config = { ...this.config, ...config };
    if (this.config.enabled) {
      this.resetStats();
    }
  }

  resetStats() {
    this.stats = {
      pathsExplored: 0,
      quotesRequested: 0,
      routesEvaluated: 0,
      startTime: Date.now(),
    };
  }

  getStats() {
    if (!this.config.enabled) return null;
    return {
      ...this.stats,
      elapsedMs: Date.now() - this.stats.startTime,
    };
  }

  private emit(info: DebugInfo) {
    if (this.config.enabled && this.config.callback) {
      this.config.callback(info);
    }
  }

  // Instead of passing full payloads from Router, we accept only the necessary variables
  // and construct the final DebugInfo object here.

  logPathfindingStart(
    tokenInId: string,
    tokenOutId: string,
    amount: number,
    maxHops: number
  ) {
    if (!this.config.enabled) return;
    this.resetStats();
    this.emit({
      phase: "pathfinding",
      details: { tokenIn: tokenInId, tokenOut: tokenOutId, amount, maxHops },
      timestamp: Date.now(),
    });
  }

  logNoPathsFound() {
    if (!this.config.enabled) return;
    this.emit({
      phase: "pathfinding",
      details: {
        error: "No paths found",
        stats: this.getStats(),
      },
      timestamp: Date.now(),
    });
  }

  logFoundPaths(
    pathsExplored: number,
    validRoutesCount: number,
    bestRouteAnalysis: any
  ) {
    if (!this.config.enabled) return;
    this.emit({
      phase: "evaluation",
      details: {
        totalPaths: pathsExplored,
        validRoutes: validRoutesCount,
        bestRoute: bestRouteAnalysis,
        stats: this.getStats(),
      },
      timestamp: Date.now(),
    });
  }

  logPathExploration(
    currentToken: string,
    visitedTokens: string[],
    currentPathLength: number,
    foundPaths: number,
    elapsedMs: number
  ) {
    if (!this.config.enabled || !this.config.logPathfinding) return;
    this.emit({
      phase: "pathfinding",
      details: {
        currentToken,
        visitedTokens,
        currentPathLength,
        foundPaths,
        elapsedMs,
      },
      timestamp: Date.now(),
    });
  }

  logRouteEvaluation(
    path: string[],
    inputAmount: number,
    outputAmount: number,
    fees: number,
    hopDetails: any[],
    elapsedMs: number
  ) {
    if (!this.config.enabled || !this.config.logEvaluation) return;
    this.stats.routesEvaluated++;
    this.emit({
      phase: "evaluation",
      details: {
        path,
        inputAmount,
        outputAmount,
        fees,
        hopDetails,
        elapsedMs,
      },
      timestamp: Date.now(),
    });
  }

  incrementPathsExplored() {
    if (this.config.enabled) {
      this.stats.pathsExplored++;
    }
  }

  incrementQuotesRequested() {
    if (this.config.enabled) {
      this.stats.quotesRequested++;
    }
  }
}

export const debugUtils = new DebugUtils();

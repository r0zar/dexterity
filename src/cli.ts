#!/usr/bin/env node
import { Command } from "commander";
import { Dexterity } from "./core/sdk";
import type { ContractId, SDKConfig } from "./types";
import chalk from "chalk";
import ora from "ora";
import { STACKS_MAINNET, STACKS_TESTNET } from "@stacks/network";
import { debugUtils } from "./utils/debug";
import {
  CLI_CONFIG_FILE,
  DEFAULT_SDK_CONFIG
} from "./utils/config";

// Initialize program
const program = new Command();

program
  .name("dexterity")
  .description("CLI for interacting with Dexterity AMM protocol")
  .version(process.env.npm_package_version || require("../package.json").version);

// Global options
program
  .option("-n, --network <network>", "Network to use (mainnet/testnet)", "mainnet")
  .hook("preAction", async (thisCommand) => {
    const options = thisCommand.opts();
    
    // Set network based on CLI option
    await Dexterity.configure({ network: options.network });
  });

// Configuration Commands
program
  .command("config")
  .description("Manage CLI configuration")
  .option("-l, --list", "List current configuration")
  .option("-s, --set <key> <value>", "Set configuration value")
  .option("-g, --get <key>", "Get configuration value")
  .action(async (options) => {
    try {
      if (options.list || (!options.set && !options.get && !options.reset)) {
        // Display current configuration
        const currentConfig = Dexterity.config;

        console.log("\nCurrent Configuration:");
        console.log("─────────────────────");

        Object.entries(currentConfig).forEach(([key, value]) => {
          if (key === 'apiKey' || key === 'privateKey') {
            const source = currentConfig[key] ? chalk.blue("(custom)") : chalk.gray("(default)");
            console.log(`${chalk.cyan(key.padEnd(16))}: ${value ? '********' : 'not set'} ${source}`);
          } else if (key === 'network') {
            const source = currentConfig[key] ? chalk.blue("(custom)") : chalk.gray("(default)");
            console.log(`${chalk.cyan(key.padEnd(16))}: ${value.client.baseUrl} ${source}`);
          } else {
            const source = currentConfig[key as keyof SDKConfig] ? chalk.blue("(custom)") : chalk.gray("(default)");
            console.log(`${chalk.cyan(key.padEnd(16))}: ${value} ${source}`);
          }
        });

        console.log("\nConfig file location:", chalk.gray(CLI_CONFIG_FILE));
        return;
      }

      if (options.set) {
        const [key, value] = options.set.split(" ");
        const parsedValue = parseConfigValue(value);
        
        // Update config through SDK which will validate
        const updatedConfig = { [key]: parsedValue };
        await Dexterity.configure(updatedConfig);
        
        // If we get here, validation passed
        console.log(chalk.green(`Successfully set ${chalk.cyan(key)} = ${chalk.yellow(value)}`));
        return;
      }

      if (options.get) {
        const key = options.get;
        const config = Dexterity.config;
        const value = config[key as keyof SDKConfig];
        
        if (value === undefined) {
          console.error(chalk.red(`Error: Invalid configuration key '${key}'`));
          process.exit(1);
        }

        console.log(`${key}: ${chalk.cyan(value)}`);
        return;
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Helper function to parse config values
function parseConfigValue(value: string): any {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (!isNaN(Number(value))) return Number(value);
  return value;
}

// Inspection Commands
program
  .command("inspect")
  .description("Inspect protocol state")
  .option("-p, --pool <contractId>", "Inspect specific pool")
  .option("-t, --token <contractId>", "Inspect specific token")
  .option("-r, --route <tokenIn> <tokenOut>", "Inspect routing between tokens")
  .option("-g, --graph", "Show routing graph statistics")
  .action(async (options) => {
    try {
      const spinner = ora("Loading protocol state...").start();
      await Dexterity.discoverPools();
      spinner.stop();

      if (options.pool) {
        const pool = Dexterity.getVault(options.pool);
        if (!pool) {
          console.error(chalk.red("Pool not found"));
          return;
        }

        const poolData = pool.getPool();
        console.log("\nPool Details:");
        console.log("─────────────────────────────────");
        console.log(`Name:      ${chalk.cyan(poolData.name)}`);
        console.log(`Contract:  ${chalk.gray(poolData.contractId)}`);
        console.log(`Fee:       ${(poolData.fee / 10000).toFixed(2)}%`);
        console.log(`Image:     ${poolData.image}`);

        const [reserve0, reserve1] = pool.getReserves();
        console.log("\nReserves:");
        console.log(
          `${poolData.liquidity[0].symbol}: ${chalk.yellow(reserve0.toLocaleString())}`
        );
        console.log(
          `${poolData.liquidity[1].symbol}: ${chalk.yellow(reserve1.toLocaleString())}`
        );
      } else if (options.token) {
        const token = await Dexterity.getTokenInfo(options.token);
        const pools = Dexterity.getVaultsForToken(options.token);

        console.log("\nToken Details:");
        console.log("─────────────────────────────────");
        console.log(`Name:      ${chalk.cyan(token.name)}`);
        console.log(`Symbol:    ${chalk.yellow(token.symbol)}`);
        console.log(`Contract:  ${chalk.gray(token.contractId)}`);
        console.log(`Decimals:  ${token.decimals}`);
        console.log(`Image:     ${token.image}`);

        if (pools.size > 0) {
          console.log("\nAvailable in Pools:");
          for (const pool of pools.values()) {
            const poolData = pool.getPool();
            console.log(
              `- ${chalk.blue(poolData.name)} (${poolData.contractId})`
            );
          }
        }
      } else if (options.route) {
        const [tokenIn, tokenOut] = options.route;
        console.log("\nAnalyzing Routes:");
        console.log("─────────────────────────────────");

        const bestRoute = await Dexterity.router.findBestRoute(
          tokenIn,
          tokenOut,
          1000000
        );
        if (bestRoute instanceof Error) {
          console.log(chalk.red("No route found"));
          return;
        }

        console.log("Optimal Path:");
        bestRoute.path.forEach((token, i) => {
          if (i < bestRoute.path.length - 1) {
            console.log(
              `${chalk.cyan(token.symbol)} → ${chalk.cyan(bestRoute.path[i + 1].symbol)}`
            );
          }
        });

        console.log("\nRoute Details:");
        console.log(`Hops:      ${chalk.yellow(bestRoute.hops.length)}`);
        // console.log(`Total Fee: ${chalk.yellow((bestRoute.totalFees / 10000).toFixed(2)}%`)}`);
      } else if (options.graph) {
        const stats = Dexterity.router.getGraphStats();
        console.log("\nRouting Graph Statistics:");
        console.log("─────────────────────────────────");
        console.log(`Nodes:     ${chalk.cyan(stats.nodeCount)} (Tokens)`);
        console.log(`Edges:     ${chalk.cyan(stats.edgeCount)} (Pools)`);
        console.log(
          `Density:   ${chalk.cyan((stats.edgeCount / (stats.nodeCount * (stats.nodeCount - 1))).toFixed(3))}`
        );

        if (Dexterity.config.debug) {
          const debugStats = debugUtils.getStats();
          console.log("\nDebug Statistics:");
          console.log(
            `Paths Explored:    ${chalk.yellow(debugStats.pathsExplored)}`
          );
          console.log(
            `Routes Evaluated:  ${chalk.yellow(debugStats.routesEvaluated)}`
          );
          console.log(
            `Quotes Requested:  ${chalk.yellow(debugStats.quotesRequested)}`
          );
        }
      }
    } catch (error) {
      console.error(
        chalk.red("Error:"),
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

// Quote command
program
  .command("quote")
  .description("Get a quote for swapping tokens")
  .argument("<tokenIn>", "Input token contract ID")
  .argument("<tokenOut>", "Output token contract ID")
  .argument("<amount>", "Amount to swap (in base units)")
  .action(async (tokenIn: ContractId, tokenOut: ContractId, amount: string) => {
    try {
      const spinner = ora("Loading pools...").start();
      await Dexterity.discoverPools();
      spinner.text = "Getting quote...";

      const quote = await Dexterity.getQuote(
        tokenIn,
        tokenOut,
        parseInt(amount)
      );
      spinner.stop();

      console.log("\nQuote Details:");
      console.log("─────────────────────────────────");
      console.log(
        `Amount In:        ${chalk.cyan(quote.amountIn.toLocaleString())} ${tokenIn}`
      );
      console.log(
        `Amount Out:       ${chalk.green(quote.amountOut.toLocaleString())} ${tokenOut}`
      );
      console.log(
        `Expected Price:   ${chalk.yellow(quote.expectedPrice.toFixed(6))}`
      );
      //   console.log(`Fee:              ${chalk.magenta((quote.fee / 10000).toFixed(2)}%`)}`);

      if (quote.route.hops.length > 1) {
        console.log("\nRoute:");
        console.log("─────────────────────────────────");
        quote.route.hops.forEach((hop, i) => {
          console.log(
            `${i + 1}. ${chalk.blue(hop.tokenIn.symbol)} → ${chalk.blue(hop.tokenOut.symbol)}`
          );
        });
      }
    } catch (error) {
      console.error(
        chalk.red("Error:"),
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

// Pool discovery command
program
  .command("pools")
  .description("List all available liquidity pools")
  .action(async () => {
    try {
      const spinner = ora("Discovering pools...").start();
      const pools = await Dexterity.discoverPools();
      spinner.stop();

      console.log("\nAvailable Pools:");
      console.log("─────────────────────────────────");
      pools.forEach((pool) => {
        console.log(`\n${chalk.cyan(pool.name)} (${pool.symbol})`);
        console.log(`Contract: ${chalk.gray(pool.contractId)}`);
        console.log(
          `Tokens:   ${pool.liquidity[0].symbol}-${pool.liquidity[1].symbol}`
        );
        console.log(`Fee:      ${(pool.fee / 10000).toFixed(2)}%`);
      });
    } catch (error) {
      console.error(
        chalk.red("Error:"),
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse();

#!/usr/bin/env node
import { Command } from "commander";
import { Dexterity } from "./core/sdk";
import type { ContractId, SDKConfig } from "./types";
import chalk from "chalk";
import ora from "ora";
import { homedir } from "os";
import { join } from "path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { STACKS_MAINNET, STACKS_TESTNET } from "@stacks/network";
import { debugUtils } from "./utils/debug";

// Config file management
const CONFIG_DIR = join(homedir(), ".dexterity");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

function loadConfig(): Partial<SDKConfig> {
  if (!existsSync(CONFIG_FILE)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
  } catch (error) {
    console.error(chalk.yellow("Warning: Could not parse config file"));
    return {};
  }
}

function saveConfig(config: Partial<SDKConfig>): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Initialize program
const program = new Command();

program
  .name("dexterity")
  .description("CLI for interacting with Dexterity AMM protocol")
  .version(
    process.env.npm_package_version || require("../package.json").version
  );

// Global options
program
  .option(
    "-n, --network <network>",
    "Network to use (mainnet/testnet)",
    "mainnet"
  )
  .hook("preAction", async (thisCommand) => {
    const options = thisCommand.opts();

    // Load config
    const savedConfig = loadConfig();

    // Set network
    Dexterity.config.network =
      options.network === "mainnet" ? STACKS_MAINNET : STACKS_TESTNET;

    // Apply saved config
    Object.assign(Dexterity.config, savedConfig);
  });

// Configuration Commands
program
  .command("config")
  .description("Manage CLI configuration")
  .option("set <key> <value>", "Set configuration value")
  .option("get <key>", "Get configuration value")
  .option("reset", "Reset configuration to defaults")
  .action(async (cmd, options) => {
    const config = loadConfig();

    if (options.args.length === 0) {
      console.log("\nCurrent Configuration:");
      console.log("─────────────────────────────────");

      // Format config for display, showing which values are defaults
      const currentConfig = Dexterity.config;
      const userConfig = loadConfig();

      const displayConfig = {
        network: {
          value: currentConfig.network.client.baseUrl,
          source: userConfig.network ? "user" : "default",
        },
        mode: {
          value: currentConfig.mode,
          source: userConfig.mode ? "user" : "default",
        },
        maxHops: {
          value: currentConfig.maxHops,
          source: userConfig.maxHops ? "user" : "default",
        },
        defaultSlippage: {
          value: currentConfig.defaultSlippage,
          source: userConfig.defaultSlippage ? "user" : "default",
        },
        proxy: {
          value: currentConfig.proxy,
          source: userConfig.proxy ? "user" : "default",
        },
        apiKey: {
          value: currentConfig.apiKey ? "***********" : "not set",
          source: userConfig.apiKey ? "user" : "default",
        },
      };

      // Display each config setting with color coding
      Object.entries(displayConfig).forEach(([key, setting]) => {
        const valueColor =
          setting.source === "user" ? chalk.green : chalk.yellow;
        const sourceLabel =
          setting.source === "user"
            ? chalk.blue("(custom)")
            : chalk.gray("(default)");
        console.log(
          `${chalk.cyan(key.padEnd(16))}: ${valueColor(setting.value)} ${sourceLabel}`
        );
      });

      console.log("\nConfig file location:", chalk.gray(CONFIG_FILE));
      if (Object.keys(userConfig).length === 0) {
        console.log(
          chalk.yellow("\nNo custom configuration set. Using default values.")
        );
        console.log(
          `To set a value, use: ${chalk.cyan("dexterity config set <key> <value>")}`
        );
      }
    } else if (options.set) {
      const [key, value] = options.set.split(" ");

      // Validate the key
      const validKeys = [
        "network",
        "mode",
        "maxHops",
        "defaultSlippage",
        "proxy",
        "apiKey",
      ];
      if (!validKeys.includes(key)) {
        console.error(chalk.red("Error: Invalid configuration key"));
        console.log("\nValid configuration keys:");
        validKeys.forEach((k) => console.log(`  ${chalk.cyan(k)}`));
        process.exit(1);
      }

      try {
        // Parse value with validation
        let parsedValue;
        switch (key) {
          case "network":
            if (!["mainnet", "testnet"].includes(value)) {
              throw new Error('Network must be either "mainnet" or "testnet"');
            }
            parsedValue = value;
            break;
          case "mode":
            if (!["client", "server"].includes(value)) {
              throw new Error('Mode must be either "client" or "server"');
            }
            parsedValue = value;
            break;
          case "maxHops":
            const hops = parseInt(value);
            if (isNaN(hops) || hops < 1 || hops > 5) {
              throw new Error("maxHops must be a number between 1 and 5");
            }
            parsedValue = hops;
            break;
          case "defaultSlippage":
            const slippage = parseFloat(value);
            if (isNaN(slippage) || slippage < 0 || slippage > 100) {
              throw new Error(
                "defaultSlippage must be a number between 0 and 100"
              );
            }
            parsedValue = slippage;
            break;
          case "minimumLiquidity":
            const min = parseInt(value);
            if (isNaN(min) || min < 0) {
              throw new Error("minimumLiquidity must be a positive number");
            }
            parsedValue = min;
            break;
          default:
            parsedValue = value;
        }

        config[key as keyof SDKConfig] = parsedValue;
        saveConfig(config);
        console.log(
          chalk.green(
            `Successfully set ${chalk.cyan(key)} = ${chalk.yellow(parsedValue)}`
          )
        );

        // Show current value being used
        console.log(chalk.gray("\nCurrent configuration:"));
        const currentValue = Dexterity.config[key as keyof SDKConfig];
        console.log(`${key}: ${chalk.cyan(currentValue)}`);
      } catch (error) {
        console.error(
          chalk.red("Error:"),
          error instanceof Error ? error.message : error
        );
        process.exit(1);
      }
    } else if (options.get) {
      const key = options.get;
      const validKeys = [
        "network",
        "mode",
        "maxHops",
        "defaultSlippage",
        "minimumLiquidity",
        "proxy",
        "apiKey",
      ];

      if (!validKeys.includes(key)) {
        console.error(chalk.red("Error: Invalid configuration key"));
        console.log("\nValid configuration keys:");
        validKeys.forEach((k) => console.log(`  ${chalk.cyan(k)}`));
        process.exit(1);
      }

      const userValue = config[key as keyof SDKConfig];
      const currentValue = Dexterity.config[key as keyof SDKConfig];

      console.log("\nConfiguration value for:", chalk.cyan(key));
      console.log("─────────────────────────────────");
      if (userValue !== undefined) {
        console.log(`Custom value: ${chalk.green(userValue)}`);
      } else {
        console.log(`Default value: ${chalk.yellow(currentValue)}`);
        console.log(
          chalk.gray(
            `\nTo set a custom value:\ndexterity config set ${key} <value>`
          )
        );
      }
    } else if (options.reset) {
      saveConfig({});
      console.log(chalk.green("Configuration reset to defaults"));
    }
  });

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

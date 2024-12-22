import { STACKS_MAINNET } from "@stacks/network";
import type { SDKConfig } from "../types";

export const DEFAULT_SDK_CONFIG: SDKConfig = {
  apiKey: process.env.HIRO_API_KEY || process.env.STACKS_API_KEY || "",
  privateKey: "",
  mode: "server",
  stxAddress: "",
  network: STACKS_MAINNET,
  defaultSlippage: 0.5,
  maxHops: 5,
  pools: [
    {
      contractId:
        "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.anonymous-welsh-cvlt",
      name: "ANONYMOUS WELSH CVLT",
      symbol: "CVLT",
      decimals: 6,
      identifier: "CVLT",
      description: "if you know, you know– if you don't, you'll learn",
      image:
        "https://kghatiwehgh3dclz.public.blob.vercel-storage.com/SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.anonymous-welsh-cvlt-1734485587555-OYki3BGwYEuRsjzWUTpcgXk9DoPxBb.png",
      fee: 25000,
      liquidity: [
        {
          contractId: "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token",
          identifier: "sbtc-token",
          name: "sBTC",
          symbol: "sBTC",
          decimals: 8,
          description:
            "BTC is a 1:1 Bitcoin-backed asset on the Stacks Bitcoin L2 that will allow developers to leverage the security, network effects, and .5T in latent capital of the Bitcoin network.",
          image:
            "https://ipfs.io/ipfs/bafkreiffe46h5voimvulxm2s4ddszdm4uli4rwcvx34cgzz3xkfcc2hiwi",
          reserves: 0,
        },
        {
          contractId:
            "SP3NE50GEXFG9SZGTT51P40X2CKYSZ5CC4ZTZ7A2G.welshcorgicoin-token",
          identifier: "welshcorgicoin",
          name: "Welshcorgicoin",
          symbol: "WELSH",
          decimals: 6,
          description:
            "$WELSH is the first memecoin built on Stacks blockchain",
          image:
            "https://raw.githubusercontent.com/Welshcorgicoin/Welshcorgicoin/main/logos/welsh_tokenlogo.png",
          reserves: 0,
        },
      ],
      supply: 0,
    },
    {
      contractId:
        "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.satoshis-private-key",
      name: "Satoshi's Private Key",
      symbol: "sBTC-STX",
      decimals: 8,
      identifier: "sBTC-STX",
      description: "The first permissionless sBTC liquidity pool on Stacks",
      image:
        "https://kghatiwehgh3dclz.public.blob.vercel-storage.com/SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.satoshis-private-key-1734459899113-2SgyeQPzEN9UtnSmrjc73g9BTe2Hec.png",
      fee: 100,
      liquidity: [
        {
          contractId: "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token",
          identifier: "sbtc-token",
          name: "sBTC",
          symbol: "sBTC",
          decimals: 6,
          description:
            "BTC is a 1:1 Bitcoin-backed asset on the Stacks Bitcoin L2 that will allow developers to leverage the security, network effects, and .5T in latent capital of the Bitcoin network.",
          image:
            "https://ipfs.io/ipfs/bafkreiffe46h5voimvulxm2s4ddszdm4uli4rwcvx34cgzz3xkfcc2hiwi",
          reserves: 0,
        },
        {
          contractId: ".stx",
          identifier: "STX",
          name: "Stacks Token",
          symbol: "STX",
          decimals: 6,
          reserves: 422880586,
          description: "The native token of the Stacks blockchain.",
          image: "https://charisma.rocks/stx-logo.png",
        },
      ],
      supply: 0,
    },
    {
      contractId:
        "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charismatic-corgi-liquidity",
      name: "Charismatic Corgi Liquidity",
      symbol: "CORGI",
      decimals: 6,
      identifier: "CORGI",
      description: "Unstoppable DeFi meets Generational Welsh",
      image:
        "https://kghatiwehgh3dclz.public.blob.vercel-storage.com/SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charismatic-corgi-liquidity-1734454214533-VAMB0007tsGG6OscAyD0lIFICyg5Xa.png",
      fee: 50000,
      liquidity: [
        {
          contractId:
            "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-token",
          identifier: "charisma",
          name: "Charisma",
          symbol: "CHA",
          decimals: 6,
          description: "The primary token of the Charisma ecosystem.",
          image: "https://charisma.rocks/charisma-logo-square.png",
          reserves: 0,
        },
        {
          contractId:
            "SP3NE50GEXFG9SZGTT51P40X2CKYSZ5CC4ZTZ7A2G.welshcorgicoin-token",
          identifier: "welshcorgicoin",
          name: "Welshcorgicoin",
          symbol: "WELSH",
          decimals: 6,
          description:
            "$WELSH is the first memecoin built on Stacks blockchain",
          image:
            "https://raw.githubusercontent.com/Welshcorgicoin/Welshcorgicoin/main/logos/welsh_tokenlogo.png",
          reserves: 0,
        },
      ],
      supply: 0,
    },
    // {
    //   contractId: "SP3T1M18J3VX038KSYPP5G450WVWWG9F9G6GAZA4Q.mecha-meme",
    //   name: "MECHA MEME",
    //   symbol: "MECHA",
    //   decimals: 6,
    //   identifier: "MECHA",
    //   description:
    //     "Provide liquidity for the Charisma/MEME pair while you work at McDonalds",
    //   image:
    //     "https://kghatiwehgh3dclz.public.blob.vercel-storage.com/SP3T1M18J3VX038KSYPP5G450WVWWG9F9G6GAZA4Q.mecha-meme-1734448222329-Y3dlgn2TKFo9dRx3LWt6IqcioKJO60.png",
    //   fee: NaN,
    //   liquidity: [
    //     {
    //       contractId:
    //         "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-token",
    //       identifier: "undefined",
    //       name: "undefined",
    //       symbol: "undefined",
    //       decimals: NaN,
    //       description: "The primary token of the Charisma ecosystem.",
    //       image: "https://charisma.rocks/charisma-logo-square.png",
    //       reserves: NaN,
    //     },
    //     {
    //       contractId: "SP3HNEXSXJK2RYNG5P6YSEE53FREX645JPJJ5FBFA.meme-stxcity",
    //       identifier: "undefined",
    //       name: "undefined",
    //       symbol: "undefined",
    //       decimals: NaN,
    //       description:
    //         "$MEME, the mother of all memes. STX.CITY record for fastest bonding curve. By George Grant aka @TheOneNFT ",
    //       image:
    //         "https://pdakhjpwkuwtadzmpnjm.supabase.co/storage/v1/object/public/token_logo/PxxUGCcj-f03c194bd4d181b.png",
    //       reserves: NaN,
    //     },
    //   ],
    //   supply: 0,
    // },
    {
      contractId:
        "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.dungeon-master-liquidity",
      name: "Dungeon Master Liquidity",
      symbol: "DML",
      decimals: 6,
      identifier: "DML",
      description: "Liquidity pool token for the STX-DMG pair",
      image:
        "https://kghatiwehgh3dclz.public.blob.vercel-storage.com/SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.dungeon-master-liquidity-1734447479125-du9sAObfA2NMbuLGYkP0e0xnZoMYnE.png",
      fee: 0,
      liquidity: [
        {
          contractId: ".stx",
          identifier: "STX",
          name: "Stacks Token",
          symbol: "STX",
          decimals: 6,
          reserves: 422880586,
        },
        {
          contractId:
            "SP2D5BGGJ956A635JG7CJQ59FTRFRB0893514EZPJ.dme000-governance-token",
          identifier: "charisma",
          name: "Charisma Governance",
          symbol: "DMG",
          decimals: 6,
          description:
            "DMG is the governance token for the Charisma Protocol, giving holders the power to shape the future of the Dungeon Master DAO. By holding DMG, users can propose and vote on key decisions, driving the evolution of the Charisma ecosystem.",
          image: "https://charisma.rocks/dmg-logo.gif",
          reserves: 0,
        },
      ],
      supply: 0,
    },
    {
      contractId:
        "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.welsh-community-lp",
      name: "STX-WELSH LP Token",
      symbol: "STX-WELSH",
      decimals: 6,
      identifier: "STX-WELSH",
      description: "Liquidity pool token for the STX-WELSH trading pair",
      image:
        "https://kghatiwehgh3dclz.public.blob.vercel-storage.com/SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.welsh-community-lp-1734444867488-jMsQNrQe3wPsmjRcs2DS0KlubgNqaO.png",
      fee: 20000,
      liquidity: [
        {
          contractId: ".stx",
          identifier: "STX",
          name: "Stacks Token",
          symbol: "STX",
          decimals: 6,
          reserves: 422880586,
        },
        {
          contractId:
            "SP3NE50GEXFG9SZGTT51P40X2CKYSZ5CC4ZTZ7A2G.welshcorgicoin-token",
          identifier: "welshcorgicoin",
          name: "Welshcorgicoin",
          symbol: "WELSH",
          decimals: 6,
          description:
            "$WELSH is the first memecoin built on Stacks blockchain",
          image:
            "https://raw.githubusercontent.com/Welshcorgicoin/Welshcorgicoin/main/logos/welsh_tokenlogo.png",
          reserves: 0,
        },
      ],
      supply: 0,
    },
    // {
    //   contractId: "SPGYCP878RYFVT03ZT8TWGPKNYTSQB1578VVXHGE.upgraded-shark",
    //   name: "CHA-SHARK LP Token",
    //   symbol: "CHA-SHARK",
    //   decimals: 6,
    //   identifier: "upS",
    //   description: "Liquidity pool token for the CHA-SHARK trading pair",
    //   image:
    //     "https://kghatiwehgh3dclz.public.blob.vercel-storage.com/SPGYCP878RYFVT03ZT8TWGPKNYTSQB1578VVXHGE.upgraded-shark-1734441274898-78wqbVuWSg4hdfefOYf3UK60UmNrrM.png",
    //   fee: 50000,
    //   liquidity: [
    //     {
    //       contractId:
    //         "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-token",
    //       identifier: "undefined",
    //       name: "undefined",
    //       symbol: "undefined",
    //       decimals: NaN,
    //       description: "The primary token of the Charisma ecosystem.",
    //       image: "https://charisma.rocks/charisma-logo-square.png",
    //       reserves: NaN,
    //     },
    //     {
    //       contractId:
    //         "SP1KMAA7TPZ5AZZ4W67X74MJNFKMN576604CWNBQS.shark-coin-stxcity",
    //       identifier: "undefined",
    //       name: "undefined",
    //       symbol: "undefined",
    //       decimals: NaN,
    //       description: "First Shark memecoin on Stacks",
    //       image:
    //         "https://pdakhjpwkuwtadzmpnjm.supabase.co/storage/v1/object/public/token_logo/jXcEqlsF-sharkcoin-blacklogo2.JPG",
    //       reserves: NaN,
    //     },
    //   ],
    //   supply: 0,
    // },
    // {
    //   contractId: "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.stx-hoot-lp-token",
    //   name: "STX-HOOT LP Token",
    //   symbol: "STX-HOOT",
    //   decimals: 6,
    //   identifier: "SHOOT",
    //   description:
    //     "Liquidity pool token representing shares in a STX-HOOT trading pair",
    //   image:
    //     "https://kghatiwehgh3dclz.public.blob.vercel-storage.com/SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.stx-hoot-lp-token-1734435207753-Gueul0zq2XpbgFt6pVg7m0pPczgYzO.png",
    //   fee: 20000,
    //   liquidity: [
    //     {
    //       contractId: ".stx",
    //       identifier: "STX",
    //       name: "Stacks Token",
    //       symbol: "STX",
    //       decimals: 6,
    //       reserves: 422880586,
    //     },
    //     {
    //       contractId:
    //         "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.hooter-the-owl",
    //       identifier: "undefined",
    //       name: "undefined",
    //       symbol: "undefined",
    //       decimals: NaN,
    //       description: "Perseverantia Omnia Vincit.",
    //       image: "https://charisma.rocks/sip10/hooter/logo.png",
    //       reserves: NaN,
    //     },
    //   ],
    //   supply: 0,
    // },
    // {
    //   contractId: "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.stx-hoot-lp-token",
    //   name: "STX-HOOT LP Token",
    //   symbol: "STX-HOOT",
    //   decimals: 6,
    //   identifier: "SHOOT",
    //   description:
    //     "Liquidity pool token representing shares in a STX-HOOT trading pair",
    //   image:
    //     "https://kghatiwehgh3dclz.public.blob.vercel-storage.com/SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.stx-hoot-lp-token-1734435207753-Gueul0zq2XpbgFt6pVg7m0pPczgYzO.png",
    //   fee: 20000,
    //   liquidity: [
    //     {
    //       contractId: ".stx",
    //       identifier: "STX",
    //       name: "Stacks Token",
    //       symbol: "STX",
    //       decimals: 6,
    //       reserves: 422880586,
    //     },
    //     {
    //       contractId:
    //         "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.hooter-the-owl",
    //       identifier: "undefined",
    //       name: "undefined",
    //       symbol: "undefined",
    //       decimals: NaN,
    //       description: "Perseverantia Omnia Vincit.",
    //       image: "https://charisma.rocks/sip10/hooter/logo.png",
    //       reserves: NaN,
    //     },
    //   ],
    //   supply: 0,
    // },
    // {
    //   contractId: "SP15WAVKQNT241YVCGQMJS777E17H9TS96M21Q5DX.sexy-pepe",
    //   name: "pepe sexy nine",
    //   symbol: "PEPE69",
    //   decimals: 6,
    //   identifier: "PEPE69",
    //   description: "lp de fak of pepe stx",
    //   image:
    //     "https://kghatiwehgh3dclz.public.blob.vercel-storage.com/SP15WAVKQNT241YVCGQMJS777E17H9TS96M21Q5DX.sexy-pepe-1734373455585-D98rgrh4hQr7FonHuf1MBbBxOShyo1.png",
    //   fee: 6900,
    //   liquidity: [
    //     {
    //       contractId: ".stx",
    //       identifier: "STX",
    //       name: "Stacks Token",
    //       symbol: "STX",
    //       decimals: 6,
    //       reserves: 92400000,
    //     },
    //     {
    //       contractId:
    //         "SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275.tokensoft-token-v4k68639zxz",
    //       identifier: "undefined",
    //       name: "undefined",
    //       symbol: "undefined",
    //       decimals: NaN,
    //       description:
    //         "Greetings, Earthlings! I grant you the opportunity to join my intergalactic economy by embracing Pepe Coin (PEPE).",
    //       image:
    //         "https://bafkreifq2bezvmjwfztjt4s3clt7or43kewxtg4ntbqur6axnh5qchkemu.ipfs.nftstorage.link/",
    //       reserves: NaN,
    //     },
    //   ],
    //   supply: 0,
    // },
    // {
    //   contractId: "SP1KMAA7TPZ5AZZ4W67X74MJNFKMN576604CWNBQS.stxshark",
    //   name: "STX-SHARK LP Token",
    //   symbol: "STX-SHARK",
    //   decimals: 6,
    //   identifier: "STX-SHARK",
    //   description: "Liquidity pool token for the STX and SHARK pair",
    //   image:
    //     "https://kghatiwehgh3dclz.public.blob.vercel-storage.com/SP1KMAA7TPZ5AZZ4W67X74MJNFKMN576604CWNBQS.stxshark-1734370951006-fbCYueZ6m1cqkMQ2Isj963DLXGL9ne.png",
    //   fee: 50000,
    //   liquidity: [
    //     {
    //       contractId: ".stx",
    //       identifier: "STX",
    //       name: "Stacks Token",
    //       symbol: "STX",
    //       decimals: 6,
    //       reserves: 35959206,
    //     },
    //     {
    //       contractId:
    //         "SP1KMAA7TPZ5AZZ4W67X74MJNFKMN576604CWNBQS.shark-coin-stxcity",
    //       identifier: "undefined",
    //       name: "undefined",
    //       symbol: "undefined",
    //       decimals: NaN,
    //       description: "First Shark memecoin on Stacks",
    //       image:
    //         "https://pdakhjpwkuwtadzmpnjm.supabase.co/storage/v1/object/public/token_logo/jXcEqlsF-sharkcoin-blacklogo2.JPG",
    //       reserves: NaN,
    //     },
    //   ],
    //   supply: 0,
    // },
    {
      contractId: "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charismatic-flow",
      name: "Charismatic Flow",
      symbol: "SXC",
      decimals: 6,
      identifier: "SXC",
      description: "Liquidity pool token for the STX and Charisma pair",
      image:
        "https://kghatiwehgh3dclz.public.blob.vercel-storage.com/SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charismatic-flow-pool-v1-1734365975789-t1cAry1urbi7IuZngJmE5yifkCYIPy.png",
      fee: 15000,
      liquidity: [
        {
          contractId: ".stx",
          identifier: "STX",
          name: "Stacks Token",
          symbol: "STX",
          decimals: 6,
          reserves: 422880586,
          description: "The native token of the Stacks blockchain.",
          image: "https://charisma.rocks/stx-logo.png",
        },
        {
          contractId:
            "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-token",
          identifier: "charisma",
          name: "Charisma",
          symbol: "CHA",
          decimals: 6,
          description: "The primary token of the Charisma ecosystem.",
          image: "https://charisma.rocks/charisma-logo-square.png",
          reserves: 0,
        },
      ],
      supply: 0,
    },
    {
      contractId: "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.dexterity-pool-v1",
      name: "Dexterity",
      symbol: "DEX",
      decimals: 6,
      identifier: "DEX",
      description: "The first token to implement the liquidity pool SIP spec",
      image: "https://charisma.rocks/sip10/dexterity/logo.png",
      fee: 50000,
      liquidity: [
        {
          contractId:
            "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-token",
          identifier: "charisma",
          name: "Charisma",
          symbol: "CHA",
          decimals: 6,
          description: "The primary token of the Charisma ecosystem.",
          image: "https://charisma.rocks/charisma-logo-square.png",
          reserves: 0,
        },
        {
          contractId:
            "SP2D5BGGJ956A635JG7CJQ59FTRFRB0893514EZPJ.dme000-governance-token",
          identifier: "charisma",
          name: "Charisma Governance",
          symbol: "DMG",
          decimals: 6,
          description:
            "DMG is the governance token for the Charisma Protocol, giving holders the power to shape the future of the Dungeon Master DAO. By holding DMG, users can propose and vote on key decisions, driving the evolution of the Charisma ecosystem.",
          image: "https://charisma.rocks/dmg-logo.gif",
          reserves: 0,
        },
      ],
      supply: 0,
    },
  ],
  preferredPools: [],
  routerAddress: "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS",
  routerName: "multihop",
  minimumLiquidity: 1000,
  discovery: {
    startBlock: 0,
    batchSize: 1000,
    parallelRequests: 1,
    refreshInterval: 300000,
    cacheConfig: {
      ttl: 300000,
      maxItems: 100,
    },
  },
};

export function validateConfig(config?: Partial<SDKConfig>): SDKConfig {
  const finalConfig = {
    ...DEFAULT_SDK_CONFIG,
    ...config,
  };

  // Validate required fields
  if (!finalConfig.network) {
    throw new Error("Network configuration is required");
  }

  if (
    typeof finalConfig.defaultSlippage !== "number" ||
    finalConfig.defaultSlippage <= 0 ||
    finalConfig.defaultSlippage > 100
  ) {
    throw new Error("Default slippage must be a number between 0 and 100");
  }

  // Validate optional numeric fields
  if (
    finalConfig.maxHops !== undefined &&
    (finalConfig.maxHops < 1 || finalConfig.maxHops > 5)
  ) {
    throw new Error("Max hops must be between 1 and 5");
  }

  // Validate pools if provided
  if (finalConfig.pools) {
    if (!Array.isArray(finalConfig.pools)) {
      throw new Error("Pools must be an array");
    }

    // Basic validation of pool structure
    for (const pool of finalConfig.pools) {
      if (!pool.contractId || !pool.liquidity || pool.liquidity.length !== 2) {
        throw new Error("Invalid pool configuration");
      }
    }
  }

  return finalConfig;
}

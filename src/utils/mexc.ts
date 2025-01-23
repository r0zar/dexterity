import { Spot } from "@theothergothamdev/mexc-sdk";
import "dotenv/config";

const apiKey = process.env.MEXC_API_KEY;
const apiSecret = process.env.MEXC_API_SECRET;

const client = new Spot(apiKey, apiSecret);

export { client };
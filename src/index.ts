import { logShipper } from "./shipper"
import { LogPayload } from "./types"

export interface Env {
	TOKEN: string
	LOKI_ENDPOINT: string
}

export type LogShipperFunction = (logs: LogPayload, env: Env) => Promise<Response>

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext
	): Promise<Response> {
		if (request.headers.get("content-length") === "4") {
			console.log("got test")
			return new Response("ok")
		}
		if (request.headers.get("content-encoding") === "gzip") {
			// This is a logpush batch
			console.log("got logs")

			// Verify token
			if (request.headers.get("Authorization")?.split("earer ")[1] !== env.TOKEN) {
				return new Response("invalid token", {
					status: 401
				})
			}

			// Get the body payload, it's gzip encoded
			const ds = new DecompressionStream("gzip");
			const tds = new TextDecoderStream();

			const chunks = await request.body!.pipeThrough(ds).pipeThrough(tds);

			let data = "";
			for await (let chunk of chunks) {
				data = data + chunk;
			}

			return logShipper(JSON.parse(data), env)
		}
		return new Response("ok")
	},
}

import { encode } from "js-base64"

import { Env, LogShipperFunction } from "."
import { LogPayload } from "./types"

export const logShipper: LogShipperFunction = async (
  logPayloads: LogPayload[],
  env: Env
) => {
  const [userPass, remainder] = env.LOKI_ENDPOINT.split("@")
  const [user, pass] = userPass.split("://")[1].split(":")
  const u = `https://${remainder}`
  const streams = logPayloads.map((lp) => {
    return [
      ...(lp.Logs
        ? lp.Logs.map((log) => {
            return {
              stream: {
                cluster: "cloudflarelogpush",
                level: log.Level === "log" ? "info" : log.Level,
              },
              values: [[(log.TimestampMs*1000*1000).toString(), JSON.stringify(log.Message)]],
            }
          })
        : []),
      ...(lp.Exceptions
        ? lp.Exceptions.map((e) => {
            return {
              stream: {
                cluster: "cloudflarelogpush",
                level: "error",
              },
              values: [[(e.TimestampMs*1000*1000).toString(), JSON.stringify(e.Message)]],
            }
          })
        : []),
    ]
  }).flat()
  return await fetch(u, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Basic ${encode(user + ":" + pass)}`,
    },
    body: JSON.stringify({
      streams,
    }),
  })
}

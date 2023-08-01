import { encode } from 'js-base64'

import { Env, LogShipperFunction } from "."
import { LogPayload } from "./types"

export const logShipper: LogShipperFunction = async (
  logPayload: LogPayload,
  env: Env
) => {
  const [userPass, remainder] = env.LOKI_ENDPOINT.split("@")
  const [user, pass] = userPass.split("://")[1].split(":")
  const u = `https://${remainder}`
  return await fetch(u, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Authorization": `Basic ${encode(user + ":" + pass)}`
    },
    body: JSON.stringify({
      streams: [
        ...logPayload.Logs ? logPayload.Logs.map((log) => {
          return {
            stream: {
              cluster: "cloudflarelogpush",
              level: log.Level,
            },
            values: [[log.TimestampMs, log.Message]],
          }
        }) : [],
        ...logPayload.Exceptions ? logPayload.Exceptions.map((e) => {
          return {
            stream: {
              cluster: "cloudflarelogpush",
              level: "error",
            },
            values: [[e.TimestampMs, e.Message]],
          }
        }) : [],
      ],
    }),
  })
}

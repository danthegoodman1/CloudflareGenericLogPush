/**
 * This example will make as single log line per console.log message, with each `jsonPayload` being the `line.Message` array
 *
 * See https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry for more
 */

import { Base64 } from 'js-base64'
import { LogShipperFunction } from '../src'
import { LogPayload } from '../src/types'

export interface ServiceAccount {
  "type": string
  "project_id": string
  "private_key_id": string
  "private_key": string
  "client_email": string
  "client_id": string
  "auth_uri": string
  "token_uri": string
  "auth_provider_x509_cert_url": string
  "client_x509_cert_url": string
}

export interface Env {
	TOKEN: string
	ServiceAccountJSON: string
}

export const googleDestinationFunction: LogShipperFunction = async (logs: LogPayload[], env: Env) => {
  const sa = JSON.parse(env.ServiceAccountJSON) as ServiceAccount

  const pemHeader = "-----BEGIN PRIVATE KEY-----"
  const pemFooter = "-----END PRIVATE KEY-----"

  const pem = sa.private_key.replace(/\n/g, "")
  if (!pem.startsWith(pemHeader) || !pem.endsWith(pemFooter)) {
    throw new Error("Invalid service account private key")
  }

  const pemContents = pem.substring(
    pemHeader.length,
    pem.length - pemFooter.length
  )

  const buffer = Base64.toUint8Array(pemContents)

  const algorithm = {
    name: "RSASSA-PKCS1-v1_5",
    hash: {
      name: "SHA-256",
    },
  }

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    buffer,
    algorithm,
    false,
    ["sign"]
  )

  const header = Base64.encodeURI(
    JSON.stringify({
      alg: "RS256",
      typ: "JWT",
      kid: sa.private_key_id,
    })
  )

  const iat = Math.floor(Date.now() / 1000)
  const exp = iat + 3600

  const payload = Base64.encodeURI(
    JSON.stringify({
      iss: sa.client_email,
      sub: sa.client_email,
      aud: "https://logging.googleapis.com/",
      exp,
      iat,
    })
  )

  const textEncoder = new TextEncoder()
  const inputArrayBuffer = textEncoder.encode(`${header}.${payload}`)

  const outputArrayBuffer = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    privateKey,
    inputArrayBuffer
  )

  const signature = Base64.fromUint8Array(
    new Uint8Array(outputArrayBuffer),
    true
  )

  const token = `${header}.${payload}.${signature}`

  const entries: any[] = []
  for (const log of logs) {
    entries.push(...log.Logs.map((line) => {
      return {
        severity: (() => {
          if (line.Level === "log") {
            return "INFO"
          }
          return line.Level.toUpperCase()
        })(),
        timestamp: new Date(line.TimestampMs).toISOString(),
        labels: {
          scriptName: log.ScriptName,
          executionType: log.Event.ScheduledTimeMs === null ? "request" : "durable_object_alarm",
          rayID: log.Event.RayID
        },
        jsonPayload: {
          message: line.Message,
        }
      }
    }),
    ...log.Exceptions.map((line) => {
      return {
        severity: "CRITICAL", // higher than error!
        timestamp: new Date(line.TimestampMs).toISOString(),
        labels: {
          scriptName: log.ScriptName,
          executionType: log.Event.ScheduledTimeMs === null ? "request" : "durable_object_alarm",
          rayID: log.Event.RayID
        },
        jsonPayload: {
          message: line.Message,
          errorName: line.Name
        }
      }
    }))

    const status = log.Event.Response?.Status
    if (status) {
      // Add the http log line
      entries.push({
        severity: (() => {
          if (status < 300) {
            return "INFO"
          } else if (status >= 400 && status < 500) {
            return "WARN"
          } else if (status >= 500) {
            return "ERROR"
          } else {
            return "DEFAULT"
          }
        })(),
        httpRequest: {
          requestMethod: log.Event.Request!.Method,
          requestUrl: log.Event.Request!.URL,
          status: log.Event.Response?.Status
        },
        labels: {
          scriptName: log.ScriptName,
          executionType: "request",
          rayID: log.Event.RayID
        },
      })
    }
  }

  const res = await fetch(
    "https://logging.googleapis.com/v2/entries:write",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        logName: `projects/${sa.project_id}/logs/cloudflare_workers`,
        resource: {
          type: "global", // https://cloud.google.com/logging/docs/api/v2/resource-list
        },
        entries,
          // dryRun: true // Test to make sure it would work
      }),
    }
  )
  console.log("Response from google", res.status)
}

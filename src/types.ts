export interface LogPayload {
  Event: {
    RayID: string | null
    Request?: {
      Method: "GET" | "POST" | "PUT" | "DELETE" | string | null
      URL: string | null
    }
    Response?: {
      Status: number | null
    }
    EventTimeStampMS: number
    ScheduledTimeMs: number | null
  }
  Exceptions: {
    Name: string
    Message: string
    TimestampMs: number
  }[]
  Logs: {
    TimestampMs: number
    Level: "log" | "debug" | "warn" | "error"
    Message: any[]
  }[]
  Outcome: "ok" | "exception"
  ScriptName: string
}

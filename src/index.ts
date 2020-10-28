import { initGlobalTracer } from 'opentracing'
import {
  initTracerFromEnv,
  JaegerTracer,
  TracingConfig,
  TracingOptions,
} from 'jaeger-client'

interface ITracerOpts {
  config?: TracingConfig,
  options?: TracingOptions
}

interface IConfig {
  tracer?: ITracerOpts
}

const Init = (cfg?: IConfig): JaegerTracer => {
  const cfgTracer = cfg?.tracer?.config || {}
  const optTracer = cfg?.tracer?.options || {}
  const tracer = initTracerFromEnv(cfgTracer, optTracer)
  initGlobalTracer(tracer)
  return tracer
}

export {
  Init,
}

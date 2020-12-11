import { Request, Response, NextFunction } from 'express'
import { globalTracer, FORMAT_HTTP_HEADERS, Span, Tags } from 'opentracing'
import { IncomingHttpHeaders } from 'http'
import { isInit } from '.'

const ERR_STATUS_CODE = 400

const startSpanFromCtx = (operationName: string, headers: IncomingHttpHeaders): Span => {
  const tracer = globalTracer()

  // extract from previous trace context carried via headers
  const prevTraceContext = tracer.extract(
    FORMAT_HTTP_HEADERS,
    headers,
  )

  let parentCtx
  if (prevTraceContext) {
    parentCtx = prevTraceContext
  }

  return tracer.startSpan(operationName, { childOf: parentCtx })
}

const makeFinish = (span: Span, req: Request, res: Response, errResolver?: IErrorResolverFn) => {
  return () => {
    if (errResolver ? errResolver(req, res) : (res.statusCode >= ERR_STATUS_CODE)) {
      span.setTag(Tags.SAMPLING_PRIORITY, 1)
      span.setTag(Tags.ERROR, true)
      span.log({
        event: 'error.status_message',
        message: res.statusMessage,
      })
    }

    span.setTag(Tags.HTTP_STATUS_CODE, res.statusCode)
    span.log({
      event: 'request_ended',
    })
    spanSafeFinish(span)
  }
}

type IErrorResolverFn = (req: any, res: any) => boolean
type IErrorMiddlewareFn = (err: Error, req: Request, res: Response, next: NextFunction) => void

interface IMiddlewareConfig {
  injectResponseHeader?: boolean
  errorResolverFn?: IErrorResolverFn
}

const middleware = (cfg?: IMiddlewareConfig) => {
  if (!isInit()) {
    throw new Error('You have to set `Init()` before using the middleware')
  }

  return (req: Request, res: Response, next: NextFunction) => {
    // if dissabled just skip the process
    if (process.env.JAEGER_DISABLED) {
      return next()
    }

    const span = startSpanFromCtx(req.path, req.headers)
    res.on('finish', makeFinish(span, req, res, cfg?.errorResolverFn))

    span.log({
      event: 'request_started',
    })

    span.addTags({
      [Tags.HTTP_METHOD]: req.method,
      [Tags.HTTP_URL]: req.path,
      'http.full_url': `${req.protocol}://${req.get('host')}${req.originalUrl}`,
    })

    const tracer = span.tracer()

    if (cfg?.injectResponseHeader) {
      const injectedHeaders = {}
      tracer.inject(span, FORMAT_HTTP_HEADERS, injectedHeaders)
      res.set(injectedHeaders)
    }

    // add span & tracer to the req object as opentracing
    Object.assign(req, {
      opentracing: {
        traceId: span.context().toTraceId(),
        tracer,
        span,
      },
    })

    return next()
  }
}

const errMiddlewareWrapper = (errMiddlewareFn: IErrorMiddlewareFn) => {
  return (err: any, req: Request, res: Response, next: NextFunction) => {
    // skip operation on disabled state
    if (process.env.JAEGER_DISABLED) {
      return errMiddlewareFn.apply(null, [err, req, res, next])
    }

    const { opentracing } = req as any
    if (isInit() && opentracing && opentracing.span && opentracing.span instanceof Span) {
      const { span } = opentracing
      span.setTag(Tags.SAMPLING_PRIORITY, 1)
      span.setTag(Tags.ERROR, true)
      span.log({
          event: 'error.message',
          message: err.message || (['string', 'number'].includes(typeof err) ? err : ''),
      })
      span.log({
        event: 'request_ended',
      })

      spanSafeFinish(span)
    }
    return errMiddlewareFn.apply(null, [err, req, res, next])
  }
}

const spanSafeFinish = (span: Span) => {
  if (!(span as any)._duration) {
    span.finish()
  }
}

export {
  middleware,
  errMiddlewareWrapper,
}

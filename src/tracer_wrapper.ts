// tslint:disable: ban-types
import { Request, Response, NextFunction } from 'express'
import { Span, Tags, globalTracer } from 'opentracing'

const tracer = globalTracer()

type TraceFnArg = [fn: Function, operationName?: string]

const isPromise = (p: any): boolean => Boolean(p && p.then && typeof p.then === 'function')

class TracerWrapper {
  req: Request
  parentSpan: Span

  constructor({ req, span }: { req: Request; span: Span }) {
    this.req = req
    this.parentSpan = span as Span
  }

  traceFn(fn: Function, operationName?: string) {
    const t = this
    // tslint:disable-next-line: only-arrow-functions
    return function () {
      const span = tracer.startSpan(operationName || fn.name, {
        childOf: t.parentSpan.context(),
      })

      try {
        const resp = fn.apply(t, Array.from(arguments))

        if (isPromise(resp)) {
          return spanHandlerPromise(span, resp)
            .catch(err => {
              if (t && t.finishSpanWithErr) {
                t.finishSpanWithErr(err)
              }
            })
        }

        spanSafeFinish(span)
        return resp
      } catch (err) {
        if (t && t.finishSpanWithErr) {
          t.finishSpanWithErr(err)
        }

        finishWithErr(err, span)
        throw err
      }
    }
  }

  traceFns(fns: TraceFnArg[]): Function[] {
    const tracedFns: Function[] = []
    for (const [fn, operationName] of fns) {
      tracedFns.push(this.traceFn(fn, operationName))
    }

    return tracedFns
  }

  finishSpan() {
    if (this.parentSpan) {
      spanSafeFinish(this.parentSpan)
    }
  }

  finishSpanWithErr(err: Error) {
    if (this.parentSpan) {
      finishWithErr(err, this.parentSpan)
    }
  }
}

const spanHandlerPromise = (span: Span, calledFn: Promise<any>): Promise<any> =>
  calledFn
    .then(resp => {
      spanSafeFinish(span)
      return resp
    })
    .catch(err => {
      finishWithErr(err, span)
      throw err
    })

/**
 * Finish the span if only unfinished
 * ref: https://github.com/slaveofcode/jaeger-client-node/blob/a4e753ea8137878908f10afa1c356fd3e436e837/src/span.js#L188
 * @param {Object} span span object to be finished
 */
const spanSafeFinish = (span: Span) => {
  if (!(span as any)._duration) {
    span.finish()
  }
}

const finishWithErr = (err: Error, span: Span) => {
  span.setTag(Tags.ERROR, true)
  span.setTag(Tags.SAMPLING_PRIORITY, 1)
  span.log({
    event: 'error',
    message: err
      ? err.message
      : '',
  })
  spanSafeFinish(span)
}

type IMiddlewareFn = (req: Request, res: Response, next: NextFunction) => void

const WrapHandler = (h: IMiddlewareFn, operationName: string): IMiddlewareFn => {
  return (req: Request, res: Response, next: NextFunction) => {
    const fnName = operationName || h.name
    const span = tracer.startSpan(fnName, {
      childOf: ((req as any).tracer && (req as any).tracer.span)
        ? (req as any).tracer.span.context()
        : undefined,
    })

    try {
      const parentWrapCaller = new TracerWrapper({ req, span })
      const expressArgs = [req, res, (arg: any) => {
        if (arg) {
          span.setTag(Tags.SAMPLING_PRIORITY, 1)
          if (arg instanceof Error) {
            span.setTag(Tags.ERROR, true)
            span.log({
              event: 'error',
              message: arg.message,
            })
          }
        }

        next(arg)
        spanSafeFinish(span)
      }]

      const resp = (h as Function).apply(parentWrapCaller, expressArgs)

      if (isPromise(resp)) {
        return spanHandlerPromise(span, resp)
      }

      spanSafeFinish(span)
      return resp
    } catch (err) {
      finishWithErr(err, span)
      throw err
    }

  }
}


export {
  WrapHandler,
}
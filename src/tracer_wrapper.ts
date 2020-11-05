// tslint:disable: ban-types
import { Request, Response, NextFunction } from 'express'
import { Span, Tags, globalTracer, SpanOptions } from 'opentracing'

const tracer = globalTracer()

type TraceFnArg = [fn: Function, operationName?: string]

const isPromise = (p: any): boolean => Boolean(p && p.then && typeof p.then === 'function')

class TracerWrapper {
  parentSpan: Span

  constructor({ span }: { span: Span }) {
    this.parentSpan = span as Span
  }

  traceFn(fn: Function, operationName?: string): () => any {
    const t = this
    // tslint:disable-next-line: only-arrow-functions
    return function () {
      const span = tracer.startSpan(operationName || fn.name, {
        childOf: t.parentSpan.context(),
      })

      const tracerWrapper = new TracerWrapper({ span })

      try {
        const resp = fn.apply(tracerWrapper, Array.from(arguments))

        if (isPromise(resp)) {
          return spanHandlerPromise(span, resp)
            .catch(err => {
              if (t && t.__finishSpanWithErr) {
                t.__finishSpanWithErr(err)
              }
              throw err
            })
        }

        spanSafeFinish(span)
        return resp
      } catch (err) {
        finishWithErr(err, span)
        if (t && t.__finishSpanWithErr) {
          t.__finishSpanWithErr(err)
        }
        throw err
      }
    }
  }

  getSpan(): Span {
    return this.parentSpan
  }

  createChildSpan(operationName: string, options?: SpanOptions): Span {
    const opts = {
      ...options,
      childOf: this.parentSpan.context(),
    }
    const span = tracer.startSpan(operationName, opts)
    return span
  }

  traceFns(fns: TraceFnArg[]): Function[] {
    const tracedFns: Function[] = []
    for (const [fn, operationName] of fns) {
      tracedFns.push(this.traceFn(fn, operationName))
    }

    return tracedFns
  }

  __finishSpan(): void {
    if (this.parentSpan) {
      spanSafeFinish(this.parentSpan)
    }
  }

  __finishSpanWithErr(err: Error): void {
    if (this.parentSpan) {
      finishWithErr(err, this.parentSpan)
    }
  }

  setOperationName(name: string): Span {
    return this.parentSpan.setOperationName(name)
  }

  setTag(key: string, val: any): Span {
    return this.parentSpan.setTag(key, val)
  }

  log(keyValuePairs: { [key: string]: any }, timestamp?: number): Span {
    return this.parentSpan.log(keyValuePairs, timestamp)
  }

  logEvent(eventName: string, payload: any): void {
    this.parentSpan.logEvent(eventName, payload)
  }

  setTagPriority(val: number = 1): void {
    this.parentSpan.setTag(Tags.SAMPLING_PRIORITY, val)
  }

  setTagError(errMsg?: string | Error): void {
    this.parentSpan.setTag(Tags.ERROR, true)
    this.parentSpan.setTag(Tags.SAMPLING_PRIORITY, 1)
    this.parentSpan.log({
      event: 'error.message',
      message: errMsg
        ? (errMsg instanceof Error
            ? errMsg.message
            : (['string', 'number'].includes(typeof errMsg) ? errMsg : ''))
        : '',
    })
  }

  setBaggageItem(key: string, value: string): Span {
    return this.parentSpan.setBaggageItem(key, value)
  }

  getBaggageItem(key: string): string | undefined {
    return this.parentSpan.getBaggageItem(key)
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
    event: 'error.message',
    message: err
      ? (
        err.message
          ? err.message
          : (['string', 'number'].includes(typeof err) ? err : ''))
      : '',
  })
  spanSafeFinish(span)
}

type IMiddlewareFn = (req: Request, res: Response, next: NextFunction) => void

const WrapHandler = (h: IMiddlewareFn, operationName: string): IMiddlewareFn => {
  return (req: Request, res: Response, next: NextFunction) => {
    const fnName = operationName || h.name
    const rany = (req as any)
    const middlewareSpan = rany.opentracing && rany.opentracing.span
      ? rany.opentracing.span
      : undefined
    const span = tracer.startSpan(fnName, {
      childOf: middlewareSpan
        ? middlewareSpan.context()
        : undefined,
    })

    const proxiedResponseMethods = [
      'json',
      'jsonp',
      'send',
      'sendFile',
      'sendStatus',
      'end',
      'render',
      'redirect',
    ]

    const reny = (res as any)
    for (const method of proxiedResponseMethods) {
      const originMethod = reny[method]
      reny[method] = ((...args: any[]) => {
        spanSafeFinish(span)

        // this preventing loop over the same method calls
        // if this method re-called again
        // on another libraries like hijackResponse
        reny[method] = originMethod

        originMethod.apply(res, args)
      }) as any
    }

    try {
      const parentWrapCaller = new TracerWrapper({ span })
      const expressArgs = [req, res, (arg: any) => {
        if (arg) {
          span.setTag(Tags.SAMPLING_PRIORITY, 1)
          if (arg instanceof Error) {
            span.setTag(Tags.ERROR, true)
            span.log({
              event: 'error.message',
              message: arg.message || (['string', 'number'].includes(typeof arg) ? arg : ''),
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

      if (resp) {
        spanSafeFinish(span)
        return resp
      }

      // no return value indicating the handler
      // will call one of methods described on `proxiedResponseMethods`
      // or just execute `next`
    } catch (err) {
      finishWithErr(err, span)
      throw err
    }

  }
}

export {
  WrapHandler,
  TracerWrapper,
}

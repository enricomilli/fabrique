import handler from '@tanstack/react-start/server-entry'
import { paraglideMiddleware } from './paraglide/server'

export default {
  fetch(request: Request): Promise<Response> {
    // TanStack Router rewrites URLs, so keep the original request.
    return paraglideMiddleware(request, () => handler.fetch(request), {
      onRedirect(response) {
        response.headers.set('Cache-Control', 'private, no-store')
      },
    })
  },
}

import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom'
import { Button } from '../components/ui/button'

export function RouteErrorPage() {
  const error = useRouteError()
  const description = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : '页面渲染时遇到未预期错误。演示数据没有被写入磁盘。'

  return <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground"><section className="panel max-w-xl p-8 text-center"><h1 className="text-xl font-semibold">页面暂时无法显示</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p><div className="mt-6 flex justify-center gap-2"><Button variant="outline" onClick={() => window.location.reload()}>重新尝试渲染</Button><Button asChild><Link to="/">返回首页</Link></Button></div></section></main>
}

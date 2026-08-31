import { Link } from 'react-router-dom'
import { Button } from '../components/ui/button'

export function NotFoundPage() {
  return <div className="panel mx-auto max-w-2xl p-10 text-center"><h2 className="text-2xl font-semibold">页面不存在</h2><p className="mt-3 text-sm text-muted-foreground">当前链接不属于 Bandi 配置管理页面，也没有回退到其他对象。</p><Button className="mt-6" asChild><Link to="/">返回</Link></Button></div>
}

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Activity, Users, Target, ArrowUpRight, MousePointerClick, RefreshCw } from 'lucide-react';

export default function GrowthDashboard() {
  // In a real implementation, these metrics would be fetched from PostHog/Internal DB
  const metrics = [
    { title: "Total Visitors", value: "12,450", trend: "+12%", icon: Users },
    { title: "Signups", value: "842", trend: "+5.2%", icon: ArrowUpRight },
    { title: "Activation Rate", value: "45%", trend: "+2.1%", icon: Activity },
    { title: "Retention (30d)", value: "68%", trend: "-1.4%", icon: RefreshCw },
  ];

  const funnels = [
    { label: "Workspace Creation Rate", value: "85%" },
    { label: "First Transaction Rate", value: "62%" },
    { label: "First Budget Rate", value: "41%" },
    { label: "First Report Rate", value: "35%" },
    { label: "Team Invite Rate", value: "22%" },
  ];

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Growth Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Monitor your acquisition, activation, and retention metrics. Single source of truth.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{metric.title}</CardTitle>
              <metric.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metric.value}</div>
              <p className="text-xs text-muted-foreground">
                <span className={metric.trend.startsWith('+') ? 'text-green-500' : 'text-red-500'}>
                  {metric.trend}
                </span>{' '}
                from last month
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Activation Funnel</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="space-y-8 mt-4">
              {funnels.map((funnel) => (
                <div key={funnel.label} className="flex items-center">
                  <div className="ml-4 space-y-1 flex-1">
                    <p className="text-sm font-medium leading-none">{funnel.label}</p>
                  </div>
                  <div className="ml-auto font-medium">{funnel.value}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Top Acquisition Sources</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-8 mt-4">
              {[
                { source: "Google Organic", users: "4,210" },
                { source: "Twitter / X", users: "1,840" },
                { source: "Direct", users: "1,200" },
                { source: "Newsletter", users: "850" },
              ].map((item) => (
                <div key={item.source} className="flex items-center">
                  <MousePointerClick className="h-4 w-4 text-muted-foreground mr-4" />
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium leading-none">{item.source}</p>
                  </div>
                  <div className="font-medium">{item.users}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

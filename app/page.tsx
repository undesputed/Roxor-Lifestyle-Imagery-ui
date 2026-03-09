import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImageIcon, Search, Upload, ListChecks, ArrowRight } from "lucide-react";
import Link from "next/link";

const steps = [
  {
    href: "/products",
    icon: Search,
    step: "01",
    title: "Find Products",
    description: "Browse Balterley products from Akeneo that are missing lifestyle imagery.",
  },
  {
    href: "/generate",
    icon: ImageIcon,
    step: "02",
    title: "Generate",
    description: "Send product cutouts to kie.ai Nano Banana Pro to create room-scene lifestyle images.",
  },
  {
    href: "/review",
    icon: ListChecks,
    step: "03",
    title: "Review",
    description: "Preview generated images and approve before pushing to production.",
  },
  {
    href: "/upload",
    icon: Upload,
    step: "04",
    title: "Upload",
    description: "Push approved images to Scaleflex DAM where they sync back to Akeneo.",
  },
];

const pipeline = [
  { label: "Source", value: "Akeneo PIM — roxor-test.cloud.akeneo.com" },
  { label: "AI Model", value: "kie.ai Nano Banana Pro" },
  { label: "Delivery", value: "Scaleflex DAM → Akeneo asset families" },
  { label: "Naming", value: "{SALESCODE}_ls1.jpg, _ls2.jpg, _ls3.jpg" },
];

export default function DashboardPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-10">
      {/* Header */}
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Roxor Group · Balterley
        </p>
        <h2 className="text-3xl font-semibold tracking-tight">Lifestyle Imagery</h2>
        <p className="text-muted-foreground">
          AI-powered room-scene generation pipeline. Find products, generate imagery, review, and deliver.
        </p>
      </div>

      {/* Pipeline steps */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {steps.map(({ href, icon: Icon, step, title, description }) => (
          <Link key={href} href={href} className="group block">
            <Card className="h-full transition-all group-hover:border-primary/40 group-hover:shadow-md dark:group-hover:shadow-primary/5">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-muted group-hover:bg-primary/10 transition-colors">
                      <Icon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <div>
                      <p className="text-[11px] font-mono text-muted-foreground">{step}</p>
                      <CardTitle className="text-sm font-semibold">{title}</CardTitle>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary/50 group-hover:translate-x-0.5 transition-all mt-1" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Pipeline details */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Pipeline Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
            {pipeline.map(({ label, value }) => (
              <div key={label}>
                <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">{label}</dt>
                <dd className="text-sm font-mono">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

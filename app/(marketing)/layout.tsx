import { SiteFooter, SiteNav } from "./site";

// The public site: Home, About and Privacy share one header and footer.
export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="relative flex flex-1 flex-col overflow-x-clip bg-cream text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <SiteNav />
      <div className="relative flex flex-1 flex-col">{children}</div>
      <SiteFooter />
    </div>
  );
}

import Link from 'next/link';

const dashboard = { href: '/dashboard', label: 'Dashboard', detail: 'AG Studio reports over all of the data below' };

// One page per PayPal endpoint the demo calls, each in app/(endpoints).
const endpoints = [
  { href: '/products', label: 'Catalog products', detail: 'GET /v1/catalogs/products' },
  { href: '/plans', label: 'Billing plans', detail: 'GET /v1/billing/plans' },
  { href: '/invoices', label: 'Invoices', detail: 'GET /v2/invoicing/invoices' },
  { href: '/transactions', label: 'Transactions', detail: 'GET /v1/reporting/transactions' },
  { href: '/balances', label: 'Balances', detail: 'GET /v1/reporting/balances' },
];

function PageLink({ href, label, detail }: { href: string; label: string; detail: string }) {
  return (
    <li>
      <Link href={href} className="flex items-baseline justify-between gap-4 py-3 hover:text-pp-blue">
        <span className="font-semibold">{label} →</span>
        <code className="text-sm text-pp-muted">{detail}</code>
      </Link>
    </li>
  );
}

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl p-16 font-paypal text-pp-ink">
      <section className="rounded-xl bg-[#10151D] p-8 text-[#F6EAD8] shadow-lg">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#D6AD67]">PayPal sandbox · AI agent security</p>
        <h1 className="mt-3 text-4xl font-extrabold">How much would your support agent give away?</h1>
        <p className="mt-4 max-w-2xl text-[#AAB7C5]">
          Heist red-teams a refund-capable AI support agent, verifies every leak against PayPal, then applies deterministic guardrails and reruns the same attacks.
        </p>
        <Link href="/heist/arena" className="mt-6 inline-flex rounded-md bg-[#D6AD67] px-5 py-3 font-bold text-[#10151D] focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[#F6EAD8]">
          Enter the Arena →
        </Link>
      </section>
      <h2 className="mt-12 text-[24px] font-semibold text-pp-navy">PayPal REST APIs with AG Grid &amp; AG Studio</h2>
      <ul className="mt-6 divide-y divide-pp-border border-y border-pp-border">
        <PageLink {...dashboard} />
      </ul>
      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-pp-muted">Endpoints</h2>
      <ul className="mt-2 divide-y divide-pp-border border-y border-pp-border">
        {endpoints.map((page) => (
          <PageLink key={page.href} {...page} />
        ))}
      </ul>
    </main>
  );
}

> ## This branch is seeded with real JVWCD data
>
> `jvwcd-demo` replaces the synthetic sample network with published data from the
> **Jordan Valley Water Conservancy District** — 27 pipe diameter bands, 31 reservoirs,
> 28 wells and 13 booster pump stations, from the JVWCD *FY2025 Summary of Operations*.
> The schema is unchanged; only the data and the asset types differ. `main` still carries
> the generic "Meridian Falls" demo.
>
> **Pipe geometry on the map is illustrative.** The District publishes pipe by diameter
> band with no alignments, so every line is drawn to the right length in an arbitrary
> place. No pipe on this map follows a real main. Facility points are geocoded from
> public street addresses, not surveyed; 12 of 72 could not be matched and are scattered
> and flagged. Treatment costs and rules are still CARNAC's invented sample library.
>
> **See [docs/JVWCD-DEMO.md](docs/JVWCD-DEMO.md)** for what is real, what is modelled,
> how to run the seed, and what the application does not yet do with this data.

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

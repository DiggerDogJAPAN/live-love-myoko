import Link from "next/link";

export default function Home() {
  return (
    <div className="layout__container section u-text-center">
      <h1 className="u-mb-4">
        Live<span style={{ color: "var(--color-accent-secondary)" }}>Love</span>
      </h1>
      <p className="u-mb-8">
        Finding your perfect home in Myoko has never been easier.
      </p>

      <div className="u-flex u-items-center u-justify-center u-gap-4">
        <Link
          href="/properties"
          className="button button--primary"
        >
          View Properties
        </Link>
        <Link
          href="/management"
          className="button button--secondary"
        >
          Property Management
        </Link>
      </div>
    </div>
  );
}

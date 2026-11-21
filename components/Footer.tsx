export function Footer() {
  return (
    <footer className="mt-auto border-t border-white/8 px-4 py-6 text-center text-[12px] leading-relaxed text-white/45">
      <p>Designed and developed by Adi Binsheraz</p>
      <p className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <a
          className="text-accent hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          href="https://instagram.com/adibinsheraz"
          target="_blank"
          rel="noreferrer"
        >
          @adibinsheraz
        </a>
        <a
          className="text-accent hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          href="mailto:adi.binsheraz@gmail.com"
        >
          adi.binsheraz@gmail.com
        </a>
      </p>
      <p className="mt-2 text-white/30">© 2026 ASCII. All rights reserved.</p>
    </footer>
  );
}

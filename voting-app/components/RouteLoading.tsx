export default function RouteLoading() {
  return (
    <main className="route-state-screen route-state-opening" role="status" aria-live="polite">
      <section className="opening-state" aria-label="CSS Voting is loading">
        <div className="boot-orb" aria-hidden="true">
          <span className="boot-ring r2" />
          <span className="boot-ring r1" />
          <span className="boot-sweep" />
          <span className="boot-logo">
            <img src="/assets/department_logo.png" alt="" />
          </span>
        </div>
        <h1>CSS Voting</h1>
        <p className="boot-sub">St. Clare College of Caloocan · Computer Science Department</p>
        <div className="boot-terminal" aria-hidden="true">
          <p className="t1"><span className="prompt">&gt;</span> <span className="tw">initialize console</span> <span className="ok">ok</span></p>
          <p className="t2"><span className="prompt">&gt;</span> <span className="tw">load election state</span> <span className="ok">ok</span></p>
          <p className="t3"><span className="prompt">&gt;</span> <span className="tw">prepare voting console</span><span className="cursor" /></p>
        </div>
        <div className="boot-bar" aria-hidden="true"><span /></div>
        <div className="boot-meta" aria-hidden="true">
          <span>loading</span>
          <span>secure</span>
        </div>
      </section>
    </main>
  );
}

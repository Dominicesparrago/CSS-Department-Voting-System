interface BrandLockupProps {
  className?: string;
}

export default function BrandLockup({ className }: BrandLockupProps) {
  return (
    <div className={`brand-lockup${className ? ` ${className}` : ''}`}>
      <div className="brand-logos">
        <span className="brand-logo scc">
          <img src="/assets/scc_logo.png" alt="St. Clare College of Caloocan logo" />
        </span>
        <span className="brand-logo dept">
          <img src="/assets/department_logo.png" alt="Computer Science Department logo" />
        </span>
      </div>
      <div className="brand-text">
        <p className="brand-inst">St. Clare College of Caloocan</p>
        <p className="brand-sub">Computer Science Department</p>
      </div>
    </div>
  );
}

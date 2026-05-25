import logo from "../../assets/Meryl_Logo_Red.svg";

type BrandLogoProps = {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
};

const sizeStyles = {
  sm: {
    shell: 'h-10 w-10 rounded-xl',
    inner: 'h-8 w-8',
    image: 'h-8',
  },
  md: {
    shell: 'h-12 w-12 rounded-2xl',
    inner: 'h-10 w-10',
    image: 'h-10',
  },
  lg: {
    shell: 'h-16 w-16 rounded-[1.5rem]',
    inner: 'h-14 w-14',
    image: 'h-14',
  },
  xl: {
    shell: 'h-24 w-24 rounded-[1.9rem]',
    inner: 'h-20 w-20',
    image: 'h-20',
  },
};

export function BrandLogo({ size = 'md', className = '' }: BrandLogoProps) {
  const styles = sizeStyles[size];

  return (
    <div
      className={`${styles.shell} ${className} flex shrink-0 items-center justify-center bg-gradient-to-br from-[#FFF7DB] via-[#FFE89A] to-[#FFD65A] shadow-2xl shadow-black/35`}
    >
      <div className={`${styles.inner} flex items-center justify-center rounded-[1rem] bg-white/18`}>
        <img src={logo} alt="Meryl Shoes" className={`${styles.image} w-full object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.35)]`} />
      </div>
    </div>
  );
}

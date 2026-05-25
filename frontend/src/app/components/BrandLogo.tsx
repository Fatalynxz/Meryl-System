import logo from "../../assets/Meryl_Logo_Red.svg";

type BrandLogoProps = {
  size?: 'sm' | 'md' | 'lg';
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
};

export function BrandLogo({ size = 'md', className = '' }: BrandLogoProps) {
  const styles = sizeStyles[size];

  return (
    <div
      className={`${styles.shell} ${className} flex shrink-0 items-center justify-center bg-gradient-to-br from-[#E5202A] via-[#FF6A1A] to-[#FFD60A] shadow-lg shadow-red-900/25 ring-1 ring-[#FFD60A]/25`}
    >
      <div className={`${styles.inner} flex items-center justify-center`}>
        <img src={logo} alt="Meryl Shoes" className={`${styles.image} w-full object-contain drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)]`} />
      </div>
    </div>
  );
}

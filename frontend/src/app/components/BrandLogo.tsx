import logo from "figma:asset/eaa74449f608e0cfccb5e3476772f169ba8ab049.png";

type BrandLogoProps = {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const sizeStyles = {
  sm: {
    shell: 'h-10 w-10 rounded-xl',
    inner: 'h-6 w-8 rounded-md',
    image: 'h-5',
  },
  md: {
    shell: 'h-12 w-12 rounded-2xl',
    inner: 'h-8 w-10 rounded-lg',
    image: 'h-6',
  },
  lg: {
    shell: 'h-14 w-14 rounded-[1.25rem]',
    inner: 'h-9 w-12 rounded-xl',
    image: 'h-7',
  },
};

export function BrandLogo({ size = 'md', className = '' }: BrandLogoProps) {
  const styles = sizeStyles[size];

  return (
    <div
      className={`${styles.shell} ${className} flex shrink-0 items-center justify-center bg-gradient-to-br from-[#E5202A] via-[#FF6A1A] to-[#FFD60A] shadow-lg shadow-red-900/25 ring-1 ring-[#FFD60A]/25`}
    >
      <div className={`${styles.inner} flex items-center justify-center bg-white px-1 shadow-inner`}>
        <img src={logo} alt="Meryl Shoes" className={`${styles.image} w-full object-contain`} />
      </div>
    </div>
  );
}

/** Phone number input for mobile and telephone fields. */
export interface PhoneInputProps {
  value?: string;
  onChange?: (value: string) => void;
}

export function PhoneInput(_props: PhoneInputProps) {
  return <input type="tel" />;
}

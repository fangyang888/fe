export interface SwitchProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, 'size' | 'onChange'> {
    type?: 'primary' | 'regular';
    size?: 'large' | 'small';
    defaultChecked?: boolean;
    checked: boolean;
    disabled?: boolean;
    onColor?: string;
    offColor?: string;
    thumbColor?: string;
    disabledColor?: string;
    width?: number | string;
    height?: number | string;
    thumbRect?: number | string;
    thumbGap?: number | string;
    onChange?: (v: boolean) => void;
}

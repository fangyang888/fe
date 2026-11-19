import React from 'react';
import { SafeAreaBottomProps } from './types';
import { classnames, isHarmony } from '../_utils/base';

const SafeAreaBottom: React.FC<SafeAreaBottomProps> = props => {
    const { className, ...restProps } = props;

    return (
        <div
            className={classnames('my-safe-area-bottom', { 'is-harmony': isHarmony }, className)}
            {...restProps}
        />
    );
};

export default SafeAreaBottom;
export * from './types';

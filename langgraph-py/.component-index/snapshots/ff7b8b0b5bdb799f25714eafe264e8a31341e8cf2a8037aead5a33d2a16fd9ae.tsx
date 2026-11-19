import React from 'react';
import { Webview, DemoBlock } from '@meetyou/react-packages';
import DemoStatus from './Status';
import DemoCustomTips from './CustomTips';
import DemoSize from './Size';
import DemoIcons from './Icons';
import DemoFull from './Full';
import DemoNavbar from './Navbar';
import DemoCustomButton from './CustomButton';
import DemoLegacyStatus from './LegacyStatus';

import '../../../style/status-alert.scss';

export default () => {
    return (
        <Webview title='StatusAlert'>
            <DemoBlock title='基本用法'>
                <DemoStatus />
            </DemoBlock>
            <DemoBlock title='结合Nav'>
                <DemoNavbar />
            </DemoBlock>
            <DemoBlock title='旧版小柚子样式'>
                <DemoLegacyStatus />
            </DemoBlock>
            <DemoBlock title='自定义提示文案'>
                <DemoCustomTips />
            </DemoBlock>
            <DemoBlock title='自定义 Icon'>
                <DemoIcons />
            </DemoBlock>
            <DemoBlock title='尺寸'>
                <DemoSize />
            </DemoBlock>
            <DemoBlock title='Full 模式'>
                <DemoFull />
            </DemoBlock>
            <DemoBlock title='定义按钮'>
                <DemoCustomButton />
            </DemoBlock>
        </Webview>
    );
};

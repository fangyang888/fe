import React, { useState } from 'react';
import { PaymentPopup } from '@meetyou/react-my';
import { Button } from '@meetyou/react-components';
const WrapperStyle = { background: '#f2f2f5', transform: 'translate(0,0)' };
const ContentStyle = { height: '80vh', overflow: 'auto', padding: 0 };
export default function Base() {
    const [visible, setVisible] = useState(false);
    return (
        <div style={WrapperStyle}>
            <div style={ContentStyle}>
                <Button onClick={() => setVisible(true)}>打开支付弹窗</Button>
                <PaymentPopup
                    productKey='baby_1st_month_assessment'
                    sceneKey='beiyunzixun'
                    visible={visible}
                    onVisibleChange={setVisible}
                />
            </div>
        </div>
    );
}

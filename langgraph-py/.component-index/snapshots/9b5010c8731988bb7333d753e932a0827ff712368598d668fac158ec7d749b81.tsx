import React, { useState } from 'react';
import { Switch } from '@meetyou/react-components';

export default () => {
    const [checked, setChecked] = useState(true);

    return <Switch thumbColor='rgba(255,255,255,.8)' checked={checked} onChange={setChecked} />;
};

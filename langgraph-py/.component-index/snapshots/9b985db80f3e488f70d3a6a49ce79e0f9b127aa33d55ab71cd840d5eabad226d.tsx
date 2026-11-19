import React, { useState } from 'react';
import { Switch } from '@meetyou/react-components';

export default () => {
    const [checked, setChecked] = useState(true);

    return <Switch checked={checked} onChange={setChecked} />;
};

import React, { useState } from 'react';
import { Switch } from '@meetyou/react-components';

export default () => {
    const [checked, setChecked] = useState(true);

    return <Switch onColor='green' offColor='pink' checked={checked} onChange={setChecked} />;
};

import React from 'react'
import { useState } from 'react'
import { timeToSeconds } from '../components/utils'

export default function TimeConvert() {
    const [value, setValue] = useState()
    return (
        <div>
            <h1>TimeConvert</h1>
            <p>转换时间为秒</p>
            <br />
            <h2>{timeToSeconds(value)}</h2>
            <input type="text" onChange={e => setValue(e.target.value)} />
        </div>
    )
}

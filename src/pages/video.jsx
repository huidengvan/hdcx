import React from 'react'
import SubtitlePlayer from '../components/SubtitlePlayer'
import BrowserOnly from '@docusaurus/BrowserOnly';


export default function video() {
    return (
        <BrowserOnly>
        {() => <SubtitlePlayer />}
        </BrowserOnly>
    )
}

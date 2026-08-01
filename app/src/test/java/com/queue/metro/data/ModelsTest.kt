package com.queue.metro.data

import org.junit.Assert.assertEquals
import org.junit.Test

class ModelsTest {
    @Test
    fun regionParserAcceptsChineseAndEnglish() {
        assertEquals(Region.HONG_KONG, Region.from("港島"))
        assertEquals(Region.KOWLOON, Region.from("Kowloon"))
        assertEquals(Region.NEW_TERRITORIES, Region.from("New Territories"))
    }

    @Test
    fun regionParserClassifiesFineDistrictNames() {
        assertEquals(Region.HONG_KONG, Region.from("灣仔區"))
        assertEquals(Region.KOWLOON, Region.from("觀塘"))
        assertEquals(Region.NEW_TERRITORIES, Region.from("將軍澳"))
    }
}

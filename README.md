# Ticketmaster Scraper

<!-- toc start -->

## Table of contents

- [Introduction](#introduction)
- [Cost of usage](#cost-of-usage)
- [Number of results](#number-of-results)
- [Use Cases](#use-cases)
- [Input](#input)
- [Output](#output)

<!-- toc end -->

## Introduction

Want to know about all relevant events [Ticketmaster.com](https://www.ticketmaster.com/) promotes but don't have enough time to inspect the whole website? Going through all categories and genres one by one can get really time consuming when you're interested in many categories but still want to exclude some of them for which you need to use a filter. Ticketmaster.com user interface only provides filtering of 1 category and 1 genre (e. g. you can search category Concerts and filter rock genre only). But what if you're also fan of metal, pop or even classical music? Ticketmaster Scraper searches all of these events at once and stores them in one dataset. You can merge different categories with their corresponding subcategories or generate the individual datasets for each category or genre, it's only up to you.

Another useful feature that is missing on [Ticketmaster.com](https://www.ticketmaster.com/) website is filtering events based on their location. Ticketmaster uses location from your web browser and searches events close to your area. That's definitely handy but what if you want to change the settings and give another location? Or you're currently near country borders which results in searching of events that take place in a different country. This happens quite often as only the exact geographical location is considered. With this actor, you can easily specify country or the exact location through [geohash](https://www.movable-type.co.uk/scripts/geohash.html) value. It's enough to set only one of these values but you can also combine them to get events from a specific country near the city represented by a certain geohash.

To provide compatibility with Ticketmaster's built-in search engine, Ticketmaster Scraper comes with sort options and date filter as well. You can sort the events by:

- Date
- Most Popular
- Distance
- Names A-Z
- Names Z-A

And finally filter events in a specific date range. However, Ticketmaster offers many events with no date announced or defined yet. In such case, the shortcuts TBA or TBD are used respectively. TBA and TBD events are included in the dataset by default. You can exclude them by setting TBA Events and TBD Events to `No`. Or you can even create a dataset of TBA and TBD events only.

## Cost of usage

Ticketmaster Scraper is a free of charge actor but it requires [Apify Proxy](https://apify.com/proxy) to work properly. More specifically, it needs the [residential proxy](https://apify.com/pricing/proxy) as Ticketmaster's blocking policy is strict and it blocks datacenter proxies by default. Apart from the residential IPs cost, [compute units](https://apify.com/pricing/actors) are charged for running the actor at the Apify platform.

Ticketmaster Scraper is able to scrape 200 events per 1 request which keeps both compute units and residential proxy expenses very low.

### Residential proxies

You can use residential proxies if you subscribe to a paid [plan at the Apify platform](https://apify.com/pricing). Residential IPs are charged based on the transferred data so try to optimize the maximum number of events scraped with respect to [residential proxy pricing](https://apify.com/proxy?pricing=residential-ip#pricing). These proxies are only available to be run within actors on the Apify platform, not externally. If you're interested in using residential proxies for this scraper, contact `support@apify.com` via email or in-app chat to get the proxies enabled.

### Consumption units

The actor is able to scrape approximately **20,000 events for 1 CU**. However, you'll never consume the whole CU during 1 run due to Ticketmaster's max items limitation. When you scrape the maximum number of events per 1 run which is about 5000 items, it should cost about 1/4 CU.

## Number of results

Set the maximum number of scraped events using the `maxItems` input field.

> **_NOTE:_** Ticketmaster limits API access to approximately 1200-1400 events per run (6-7 pages). If you need to scrape more events, use the **Continuation Mode** feature to chain multiple runs together and bypass this limitation.

### Continuation Mode

To scrape datasets larger than Ticketmaster's API limits (~1200 events), the actor supports continuation runs:

#### How it works:
1. **First run**: Set `continuationMode: false` and run normally until hitting API limits
2. **Check logs**: Find the `lastEventDate` in the final logs (e.g., `"2025-11-25T19:30:00"`)
3. **Continuation run**: Set `continuationMode: true` and `continuationStartDate` to the last event date
4. **Repeat**: Continue until no more events are found

#### Example workflow:
```json
// Run 1: Initial run
{
  "dateFrom": "2025-11-14",
  "dateTo": "2025-12-31",
  "continuationMode": false
}
// Result: ~1200 events, lastEventDate: "2025-11-25T19:30:00"

// Run 2: Continuation
{
  "dateFrom": "2025-11-14", 
  "dateTo": "2025-12-31",
  "continuationMode": true,
  "continuationStartDate": "2025-11-25T19:30:00"
}
// Result: Next ~1200 events, lastEventDate: "2025-12-05T20:00:00"

// Run 3: Final continuation
{
  "continuationMode": true,
  "continuationStartDate": "2025-12-05T20:00:00"
}
// Result: Remaining events, complete dataset
```

This allows you to scrape unlimited events by chaining multiple runs together.

> **_IMPORTANT:_** Due to Ticketmaster API limitations, the scraper may stop before reaching the specified `maxItems` limit. The API typically allows access to only 6-7 pages (approximately 1200-1400 events) regardless of the total number of events reported. This is a known limitation of Ticketmaster's API, not an issue with the scraper. See `TICKETMASTER_API_LIMITATION.md` for detailed explanation.

## Use Cases

Ticketmaster is one of the leading companies in the field of event tickets purchasing. It comes with the nice search engine which helps you find the relevant events but it's missing a few features that can simplify the search process. Mainly the filtering of multiple categories and subcategories at once and also proper location specification. The events scraper can be useful e. g. in the following situations:

- **Personal monitoring of relevant events** - handy search filters, no need to browse the [Ticketmaster.com](https://www.ticketmaster.com/) website
- **Price analysis** - compare Ticketmaster's price offers to other ticket providers
- **Ticket availability monitoring** - set notifications to remind you the time when the relevant tickets are put up for sale
- **Events analysis by different criteria** (location, date range) - monitor which countries are missing the events of a specific category and fill this spot

## Input

Ticketmaster Scraper offers various settings for customized event searching. Some of them follow the standard [Ticketmaster.com](https://www.ticketmaster.com/) API, others are designed to extend the existing API by new features.

### Categories

First, check all event categories you want to scrape. Input categories are mapped on the categories at [Ticketmaster.com](https://www.ticketmaster.com/). You can choose from:

- **Concert** Events
- **Sport** Events
- **Arts & Theater** Events
- **Family** Events

>  **_NOTE:_**  Feel free to check multiple categories at once but keep in mind that Ticketmaster limits the maximum [number of results](#numberOfResults) it returns. So it might be a good idea to create a separate dataset for each category and only specify more subcategories. Or you could add more restrictive filter such as the exact location or date range.

### Subcategories

The actor provides the list of subcategories for each of the main categories. These subcategories are hidden in the collapsible sections and they represent different **disciplines** of Sport events and various **genres** of Concerts, Arts & Theater and Family events. When you leave all subcategories of the scraped category unchecked, the actor scrapes everything from the given category.

> **_NOTE:_**  Always check the category you want to scrape at the top of the input. If you only check the specific subcategories (genres or sport disciplines) without checking the corresponding category, the actor won't discover the subcategories you checked.

#### Property names

Categories can contain subcategories of the same name. Sometimes they refer to the same subcategory, other time they represent different kinds of events (such as classical concerts vs classical arts and theater). To distinguish which subcategory should be scraped, use *'_category-name'* suffix after the subcategory name (see examples in the [Input Schema](https://apify.com/lhotanok/ticketmaster-scraper/input-schema), e. g. `classical_concerts` vs `classical_arts-theater`). You can use property names without *'_category-name'* suffix as well but they will be matched with all categories that include this subcategory. So if you check `concerts` and `arts-theater` categories for scraping and then specify `classical` as `true`, both classical concerts and theaters will be scraped. Whereas if you wanted to scrape only classical concerts and all theaters, you would have to set `classical_concerts` property to achieve this behavior.

### Location

Specify a desired `country` in the form of [ISO Alpha-2 Country Code](https://www.iban.com/country-codes) or an exact geographical point by filling the `geohash` value. Depending on your needs, you can use both of these fields or just one of them. Last but not least, set the `distance` radius in mile units.

### Date

No date restrictions are set by default so all dates are scraped. If you wish to put some date restrictions, check `This Weekend` field or specify the date range. While setting the date range, you don't have to fill both `From` and `To` fields. If it suits you, fill one of them only. Inside the date section, `TBA` and `TBD` events filter is also handled. By choosing the appropriate value, you can exclude the events whose date is to be announced (TBA) or to be defined (TBD). Or you can go the other way round and include TBA and TBD events only.

### Other

Apart from the previously mentioned fields, Ticketmaster Scraper also provides `Max Items` settings to limit the size of the result dataset. And to keep dataset processing simplified, it's able to sort the items by their date, relevance, distance or name.

### Examples

**Scrape all concerts**

```json
{
    "concerts": true,
    "countryCode": "US",
    "geoHash": "dr5regw3pg6ft"
}
```

**Scrape specific concerts**

```json
{
    "concerts": true,
    "rock": true,
    "metal": true,
    "pop": true,
    "countryCode": "US"
}
```

**Scrape multiple categories with specific subcategories**

```json
{
    "concerts": true,
    "arts-theater": true,
    "rock": true,
    "metal": true,
    "pop": true,
    "comedy": true,
    "opera": true,
    "classical_arts-theater": true,
    "geoHash": "dr5regw3pg6ft"
}
```

## Output

The actor stores all scraped events in a dataset where each event is a separate item in the dataset. You can get the following information for each event:

- **id**
- **url**
- **name**
- **description**
- **segment name** (category)
- **genre name**
- **date** (title, subtitle)
- **location** (address, postal code, place url)
- **offer** (url, start date for ticket purchase, price)
- **performers** (list of performers with their name and url)

### Example dataset event item

```json
{
  "id": "vvG1YZpdLJK6fm",
  "url": "https://www.ticketmaster.com/mickey-gilley-and-johnny-lee-thackerville-oklahoma-10-25-2020/event/0C005837E64C752E",
  "name": "Mickey Gilley and Johnny Lee",
  "description": "Mickey Gilley and Johnny Lee | Sun 10/25 @ 3:00pm | Global Event Center at WinStar World Casino and Resort, Thackerville, OK",
  "segmentName": "Music",
  "genreName": "Country",
  "dateTitle": "Oct 25",
  "dateSubTitle": "Sun 3:00pm",
  "streetAddress": "777 Casino Avenue",
  "addressLocality": "Thackerville",
  "addressRegion": "OK",
  "postalCode": "73459",
  "addressCountry": "US",
  "placeUrl": "https://www.ticketmaster.com/global-event-center-at-winstar-world-casino-and-resort-tickets-thackerville/venue/99186",
  "offer": {
    "offerUrl": "https://www.ticketmaster.com/mickey-gilley-and-johnny-lee-thackerville-oklahoma-10-25-2020/event/0C005837E64C752E",
    "availabilityStarts": "",
    "price": "35",
    "priceCurrency": "USD"
  },
  "performers": [
    {
      "name": "Mickey Gilley",
      "url": "https://www.ticketmaster.com/mickey-gilley-tickets/artist/732778"
    },
    {
      "name": "Johnny Lee",
      "url": "https://www.ticketmaster.com/johnny-lee-tickets/artist/732830"
    }
  ]
}
```


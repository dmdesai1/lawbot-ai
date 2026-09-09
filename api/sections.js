export default async function handler(req, res) {

  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {

    let query = "";

    if (req.method === "POST") {
      query = (req.body?.query || "").trim();
    } else {
      query = (req.query?.q || "").trim();
    }

    if (!query) {
      return res.status(400).json({
        error: "Please provide a legal section or Act to search."
      });
    }

    const q = query.toLowerCase();


    /*
      COMMON INDIAN ACT ALIASES
    */

    const actMap = [

      {
        id: "bns",
        name: "Bharatiya Nyaya Sanhita, 2023",
        patterns: [
          /\bbns\b/i,
          /bharatiya nyaya sanhita/i
        ]
      },

      {
        id: "bnss",
        name: "Bharatiya Nagarik Suraksha Sanhita, 2023",
        patterns: [
          /\bbnss\b/i,
          /bharatiya nagarik suraksha sanhita/i
        ]
      },

      {
        id: "bsa",
        name: "Bharatiya Sakshya Adhiniyam, 2023",
        patterns: [
          /\bbsa\b/i,
          /bharatiya sakshya adhiniyam/i,
          /evidence act/i
        ]
      },

      {
        id: "ipc",
        name: "Indian Penal Code, 1860",
        patterns: [
          /\bipc\b/i,
          /indian penal code/i
        ]
      },

      {
        id: "crpc",
        name: "Code of Criminal Procedure, 1973",
        patterns: [
          /\bcrpc\b/i,
          /code of criminal procedure/i
        ]
      },

      {
        id: "cpc",
        name: "Code of Civil Procedure, 1908",
        patterns: [
          /\bcpc\b/i,
          /code of civil procedure/i
        ]
      },

      {
        id: "ni-act",
        name: "Negotiable Instruments Act, 1881",
        patterns: [
          /\bni act\b/i,
          /\bn\.i\. act\b/i,
          /negotiable instruments act/i,
          /cheque bounce/i,
          /check bounce/i
        ]
      }

    ];


    /*
      FIND ACT
    */

    const selectedAct = actMap.find(act =>
      act.patterns.some(pattern =>
        pattern.test(q)
      )
    );


    /*
      DETECT SECTION NUMBER
    */

    const sectionMatch = q.match(
      /\b(?:section|sec\.?)\s*([0-9]+(?:[a-z]|-[a-z0-9]+)?)\b/i
    );

    const sectionNumber =
      sectionMatch
        ? sectionMatch[1]
        : null;


    /*
      EXACT ACT + SECTION SEARCH
    */

    if (selectedAct && sectionNumber) {

      const exactUrl =
        `https://indiacode.ecourtsindia.com/api/v1/${selectedAct.id}/section/${encodeURIComponent(sectionNumber)}`;

      const exactResponse =
        await fetch(exactUrl);

      const exactData =
        await exactResponse.json();


      /*
        EXACT PROVISION FOUND
      */

      if (
        exactResponse.ok &&
        exactData.section
      ) {

        const section =
          exactData.section;


        const sourceUrl =
          exactData.url ||
          `https://indiacode.ecourtsindia.com/${selectedAct.id}/section/${sectionNumber}/`;


        /*
          VERIFIED JUDGMENTS CONNECTED
          TO THIS PROVISION
        */

        const judgments =
          Array.isArray(exactData.judgments)
            ? exactData.judgments.map(judgment => ({

                verified: true,

                caseName:
                  judgment.title ||
                  null,

                court:
                  judgment.court_name ||
                  judgment.court ||
                  null,

                courtLevel:
                  judgment.court ||
                  null,

                date:
                  judgment.date ||
                  null,

                citation:
                  judgment.citation ||
                  null,

                cnr:
                  judgment.cnr ||
                  null,

                precedentialValue:
                  judgment.precedential_value ||
                  null,

                courtMarking:
                  judgment.court_marking ||
                  null,

                ratio:
                  judgment.ratio_decidendi ||
                  null,

                appliedToSection:
                  judgment.applied_to_this_section ||
                  null,

                basis:
                  judgment.basis ||
                  null,

                decidedUnder:
                  judgment.decided_under ||
                  null,

                source:
                  judgment.url ||
                  null

              }))
            : [];


        /*
          STATUTORY TRANSITION / MAPPING
        */

        const correspondingProvisions =
          Array.isArray(exactData.corresponds_to)
            ? exactData.corresponds_to.map(item => ({

                act:
                  item.act ||
                  null,

                section:
                  item.number ||
                  null,

                relation:
                  item.relation ||
                  null

              }))
            : [];


        /*
          RETURN VERIFIED SECTION
          + VERIFIED JUDGMENTS
          + CORRESPONDING PROVISIONS
        */

        return res.status(200).json({

          verified: true,

          query,

          total: 1,

          count: 1,

          sections: [

            {

              verified: true,

              title:
                section.heading ||
                `${selectedAct.name} Section ${section.number || sectionNumber}`,

              act:
                exactData.act?.short_title ||
                selectedAct.name,

              actId:
                selectedAct.id,

              section:
                section.number ||
                sectionNumber,

              heading:
                section.heading ||
                null,

              text:
                section.text ||
                null,

              url:
                sourceUrl,

              judgments,

              judgmentCount:
                judgments.length,

              correspondingProvisions

            }

          ]

        });

      }


      /*
        EXACT ACT + SECTION NOT FOUND
      */

      if (exactResponse.status === 404) {

        return res.status(404).json({

          verified: false,

          query,

          total: 0,

          count: 0,

          sections: [],

          error:
            `${selectedAct.name}, Section ${sectionNumber} could not be verified in the connected legal database.`

        });

      }

    }


    /*
      GENERAL LEGAL SECTION SEARCH

      Used for Acts not manually listed above.
    */

    const apiUrl =
      "https://indiacode.ecourtsindia.com/api/v1/search?" +

      new URLSearchParams({

        q: query,

        kind: "section",

        limit: "40"

      }).toString();


    const response =
      await fetch(apiUrl);


    const data =
      await response.json();


    if (!response.ok) {

      return res.status(response.status).json({

        error:
          data.error ||
          "Legal section search failed"

      });

    }


    const results =
      Array.isArray(data.results)
        ? data.results
        : [];


    /*
      CONVERT SEARCH RESULTS
    */

    const sections =
      results.map(result => {

        let actId = null;

        let section = null;


        if (result.url) {

          const match =
            result.url.match(
              /\/([^/]+)\/section\/([^/?#]+)/i
            );


          if (match) {

            actId =
              match[1];

            section =
              decodeURIComponent(
                match[2]
              );

          }

        }


        return {

          verified: true,

          title:
            result.title ||
            null,

          act:
            result.act ||
            result.act_title ||
            actId ||
            null,

          actId,

          section:
            result.section ||
            result.number ||
            section ||
            null,

          heading:
            result.heading ||
            null,

          snippet:
            result.snippet ||
            null,

          url:
            result.url ||
            null,

          judgments: [],

          judgmentCount: 0,

          correspondingProvisions: []

        };

      });


    /*
      RETURN GENERAL SEARCH RESULTS
    */

    return res.status(200).json({

      verified: true,

      query,

      total:
        data.total ||
        sections.length,

      count:
        sections.length,

      sections

    });


  } catch (error) {

    console.error(error);

    return res.status(500).json({

      error:
        "Server error while searching legal sections."

    });

  }

}

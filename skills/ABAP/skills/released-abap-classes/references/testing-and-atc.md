# ABAP Unit and ATC

One topic from the *Released ABAP Classes* cheat sheet; the rest are listed in this skill's SKILL.md.
A class appearing here is not proof it exists on your system - release state is per system and per
release. `readAbapObject` returning the object is the proof.

## Contents

- ABAP Unit
- Programmatic ABAP Test Cockpit (ATC) Check

---

## ABAP Unit

<table>
<tr>
<td> Class </td> <td> Details/Code Snippet </td>
</tr>
<tr>
<td> <code>CL_ABAP_UNIT_ASSERT</code> </td>
<td>

Provides methods to verify test expectations in ABAP Unit tests. For more information, see the [ABAP Unit Tests](14_ABAP_Unit_Tests.md) cheat sheet.


```abap
"Code in a test class

...

DATA(result) = 100.

...

cl_abap_unit_assert=>assert_equals(
  act = result
  exp = 100
  msg = `The value does not match the expected result`
  quit = if_abap_unit_constant=>quit-no ).
```

</td>
</tr>
<tr>
<td> <code>CL_ABAP_TESTDOUBLE</code><br><code>CL_OSQL_TEST_ENVIRONMENT</code><br><code>CL_CDS_TEST_ENVIRONMENT</code><br><code>CL_BOTD_TXBUFDBL_BO_TEST_ENV</code><br><code>CL_BOTD_MOCKEMLAPI_BO_TEST_ENV</code> </td>
<td>


- The classes can be used in the context of ABAP Unit to create test doubles in a standardized way. 
- The test doubles replace dependent-on components (DOC) during unit tests.
- DOCs:
  - Classes and interfaces: 
    - `CL_ABAP_TESTDOUBLE`: ABAP OO Test Double Framework
  - Database (e.g. database tables or CDS view entities) 
    - `CL_OSQL_TEST_ENVIRONMENT`: ABAP SQL Test Double Framework; to test ABAP SQL statements that depend on data sources such as database tables or CDS view entities
    - `CL_CDS_TEST_ENVIRONMENT`: ABAP CDS Test Double Framework; to test logic implemented in CDS entities
  - RAP business objects
    - `CL_BOTD_TXBUFDBL_BO_TEST_ENV`: Creating transactional buffer test doubles
    - `CL_BOTD_MOCKEMLAPI_BO_TEST_ENV`: Mocking ABAP EML APIs

- Note that more classes are available for other use cases. 
- For more information, see the [ABAP Unit Tests](14_ABAP_Unit_Tests.md) cheat sheet and the [documentation](https://help.sap.com/docs/abap-cloud/abap-development-tools-user-guide/managing-dependencies-with-abap-unit).

</td>
</tr>
</table>

<p align="right"><a href="#top">⬆️ back to top</a></p>

## Programmatic ABAP Test Cockpit (ATC) Check

<table>
<tr>
<td> Class </td> <td> Details/Code Snippet </td>
</tr>
<tr>
<td> <code>CL_SATC_API</code> </td>
<td>

- The class provides access to the ABAP Test Cockpit (ATC) API.
- Find more information about checking the quality of ABAP Code with ATC [here](https://help.sap.com/docs/ABAP_Cloud/bbcee501b99848bdadecd4e290db3ae4/4ec5711c6e391014adc9fffe4e204223.html?locale=en-US).
- The example code snippet ...
  - explores the API by creating a factory object, creating and starting an ATC run, and checking the information returned. 
  - includes some statements that are found by ATC runs such as a deprecated statement, and a literal in the code. 
  - includes check variants. You may want to comment out the one, and comment in the other. For example, find check variants as follows: Right-click in the code -> Run as -> 3 ABAP Text Cockpit With... -> Choose Browse in the pop-up -> Insert `*` for *Select your check variant* and find available check variants in the system. You can also create your own ATC check variant, for example, by right-clicking your package -> New -> Other ABAP Repository Object -> Filter for *ATC Check Variant*, select it and proceed with the wizard. 
 
<br>

```abap
CLASS zcl_demo_abap DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.

CLASS zcl_demo_abap IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.

    DATA num TYPE i VALUE 1.
    GET REFERENCE OF num INTO DATA(ref).
    DATA(current_time) = sy-uzeit.
    out->write( `Some text` ).

**********************************************************************

    TRY.
        "Creating a factory object
        DATA(atc) = cl_satc_api=>create_api_factory( ).
        "Creating an ATC run and starting it
        "The ATC run result is stored in a variable.
        DATA(atc_result) = atc->create_run(
        atc->create_run_configuration( atc->create_object_set_for_list( VALUE #( ( obj_type = 'CLAS' obj_name = 'ZCL_DEMO_ABAP' ) ) )
        )->set_check_variant( atc->get_check_variant_by_name(
        'ABAP_CLOUD_READINESS'
        "'ABAP_CLOUD_DEVELOPMENT_DEFAULT'
        ) )
        )->run( ).
      CATCH cx_satc_api INTO DATA(exc).
        out->write( |Error: { exc->get_text( ) }| ).
        RETURN.
    ENDTRY.
    "Returning the result ID
    DATA(result_id) = atc_result->get_result_id( ).
    out->write( |Result ID: { result_id }| ).

    "Returning all information of the findings reported during the run
    DATA(findings) = atc_result->get_findings_with_text( ).
    IF findings IS INITIAL.
      out->write( `No findings` ).
    ELSE.
      out->write( findings ).
    ENDIF.

  ENDMETHOD.

ENDCLASS.
``` 

</td>
</tr>


</table>

<p align="right"><a href="#top">⬆️ back to top</a></p>

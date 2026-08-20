# Getting started

One topic from the *Released ABAP Classes* cheat sheet; the rest are listed in this skill's SKILL.md.
A class appearing here is not proof it exists on your system - release state is per system and per
release. `readAbapObject` returning the object is the proof.

## Contents

- Excursions
- Running a Class and Displaying Output in the ADT Console

---

## Excursions

### Available Classes in ABAP for Cloud Development

If available to you, you have accessed an [SAP BTP ABAP Environment](https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US/index.htm?file=abensap_btp_abap_env_glosry.htm) using the [ABAP development tools for Eclipse (ADT)](https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US/index.htm?file=abenadt_glosry.htm).
Access to SAP-provided repository objects is restricted to objects that have been released for [ABAP for Cloud Development](https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US/index.htm?file=abenabap_for_cloud_dev_glosry.htm) ([released APIs](https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US/index.htm?file=abenreleased_api_glosry.htm)). You can find the released repository objects in the *Project Explorer* view in ADT under *Released Objects*. The classes are located in the *Source Code Library* folder:

![Released APIs](./files/released_APIs.png)

You can also programmatically get the released objects. You can use specific XCO classes or a CDS view, as shown in the example code snippet below.

```abap
SELECT ReleasedObjectType, ReleasedObjectName, ReleaseState
  FROM i_apisforclouddevelopment
  WHERE releasestate = 'RELEASED'
  AND ReleasedObjectType = 'CLAS'
  ORDER BY ReleasedObjectName
  INTO TABLE @DATA(released_classes).
```

<p align="right"><a href="#top">⬆️ back to top</a></p>

### Cloud Development Successors

The `I_APIsWithCloudDevSuccessor` view provides information on objects that cannot or should no longer be used in ABAP for Cloud Development along with their successors that can be used.

```abap
SELECT * FROM I_APIsWithCloudDevSuccessor
 INTO TABLE @DATA(successors_all).

SELECT * FROM I_APIsWithCloudDevSuccessor
 WHERE PredecessorObjectType = 'TABL'
 INTO TABLE @DATA(successors_tables).

SELECT SINGLE * FROM I_APIsWithCloudDevSuccessor
 WHERE PredecessorObjectName = 'TADIR'
 INTO @DATA(successor_tadir).
```

<p align="right"><a href="#top">⬆️ back to top</a></p>

## Running a Class and Displaying Output in the ADT Console

The table includes the <code>IF_OO_ADT_CLASSRUN</code> interface.

<table>
<tr>
<td> Interface/Class </td> <td> Details/Code Snippet </td>
</tr>

<tr>
<td> <code>IF_OO_ADT_CLASSRUN</code> </td>
<td>

- By implementing the <code>IF_OO_ADT_CLASSRUN</code> interface in a global class, you can make the class executable. 
- In ADT, you can execute the class using F9. 
- The statements that are processed when executing the class can be included in the implementation of the `if_oo_adt_classrun~main` method.
- Using `out->write( ... ).` statements, you can output the content of data objects to the ADT console. The `name` parameter can be used to precede the data object content with a string.

<br>

``` abap
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
    out->write( `Hello world` ).

    TYPES: BEGIN OF s,
             comp1 TYPE string,
             comp2 TYPE i,
             comp3 TYPE string_table,
             comp4 TYPE REF TO string,
           END OF s,
           it_type TYPE TABLE OF s WITH EMPTY KEY.

    DATA(struct) = VALUE s( comp1 = `Hello`
                            comp2 = 1
                            comp3 = VALUE #( ( `a` ) ( `b` ) ( `a` ) ( `p` ) )
                            comp4 = NEW #( `world` ) ).

    DATA(itab) = VALUE it_type( ( struct )
                                ( comp1 = `Hi`
                                  comp2 = 2
                                  comp3 = VALUE #( ( `x` ) ( `y` ) ( `z` ) )
                                  comp4 = NEW #( `ABAP` ) ) ).

    out->write( struct ).
    out->write( data = itab name = `itab` ).
  ENDMETHOD.
ENDCLASS.
``` 

</td>
</tr>


<tr>
<td> <code>CL_DEMO_CLASSRUN</code> </td>
<td>
As an alternative to using the <code>IF_OO_ADT_CLASSRUN</code> interface for displaying output in the console, you can also use the <code>CL_DEMO_CLASSRUN</code> class, which offers more methods.
For more information, refer to <a href="https://blogs.sap.com/2023/10/24/abap-console-reloaded/">this blog</a>.
The following example makes use of the <code>CL_DEMO_CLASSRUN</code> class. A structure and an internal table are displayed in the console. A structure component is a reference variable, which is automatically dereferenced. Plus, the <code>write_xml</code> method is shown, which displays XML data.
<br>

``` abap
CLASS zcl_demo_abap DEFINITION
  INHERITING FROM cl_demo_classrun
  PUBLIC
  CREATE PUBLIC.

  PUBLIC SECTION.
    METHODS main REDEFINITION.
  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.

CLASS zcl_demo_abap IMPLEMENTATION.
  METHOD main.
    TYPES: BEGIN OF s,
             comp1 TYPE string,
             comp2 TYPE i,
             comp3 TYPE string_table,
             comp4 TYPE REF TO string,
           END OF s,
           it_type TYPE TABLE OF s WITH EMPTY KEY.

    DATA(struct) = VALUE s( comp1 = `Hello`
                            comp2 = 1
                            comp3 = VALUE #( ( `a` ) ( `b` ) ( `a` ) ( `p` ) )
                            comp4 = NEW #( `world` ) ).

    DATA(itab) = VALUE it_type( ( struct )
                                ( comp1 = `Hi`
                                  comp2 = 2
                                  comp3 = VALUE #( ( `x` ) ( `y` ) ( `z` ) )
                                  comp4 = NEW #( `ABAP` ) ) ).

    out->write( struct ).
    out->write( itab ).

    DATA(some_xml) = cl_abap_conv_codepage=>create_out( )->convert(
    `<hi><word1>hallo</word1><word2>how</word2><word3>are</word3><word4>you</word4></hi>` ).

    out->write( some_xml ).
    out->write_xml( some_xml ).
  ENDMETHOD.
ENDCLASS.
``` 

</td>
</tr>

<tr>
<td> <code>CL_XCO_CP_ADT_SIMPLE_CLASSRUN</code> </td>
<td>

XCO alternative for output in the ADT console

<br>

``` abap
CLASS zcl_demo_abap DEFINITION
  PUBLIC
  INHERITING FROM cl_xco_cp_adt_simple_classrun
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.
  PROTECTED SECTION.
    METHODS: main REDEFINITION.
  PRIVATE SECTION.
ENDCLASS.

CLASS zcl_demo_abap IMPLEMENTATION.
  METHOD main.
    out->write( `Hello world` ).
  ENDMETHOD.
ENDCLASS.
``` 

</td>
</tr>

</table>

> [!TIP]
> - The `CL_DEMO_OUTPUT_CLOUD` class is available for demo purposes only. It wraps the output functionalities of the `CL_DEMO_OUTPUT` class that is available in Standard ABAP and used for demo display purposes, especially useful for displaying internal table content.
>- As an excursion, find examples using the class in [Creating and Using IDE Actions](./ide-actions.md).
> - Find more information in this [blog](https://community.sap.com/t5/technology-blog-posts-by-sap/cl-demo-output-goes-abap-cloud/ba-p/13782903).

<p align="right"><a href="#top">⬆️ back to top</a></p>
